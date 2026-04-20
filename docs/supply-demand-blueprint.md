 
 Supply &amp; Demand Institutional Intelligence Engine Master blueprint for a world-class, 
imbalance-aware detection, scoring, alerting, execution, and analytics platform Design intent. This 
document specifies the operating model for a serious supply and demand engine. It defines the data 
plane, feature plane, zone logic, imbalance verification, state management, API surface, UI, 
alerting, trade execution, and smart exits so the system can progress from research notebook to 
production desk tool without changing its core language. Version 1.0 • Generated 2026-04-20 • 
Prepared as an implementation blueprint Blueprint contents Section What it delivers 1. Operating 
objectives The product promise, key constraints, and success criteria. 2. Complete architecture 
Services, data flows, deployment topology, and operational responsibilities. 3. Database schema 
Operational tables, field definitions, retention tiers, and indexing guidance. 4. Scoring formulas 
Institutional score components and the exact weighting logic. 5. Detection pseudocode Algorithms 
for zone discovery, imbalance detection, retest validation, and exits. 6. API routes Endpoints for 
ingestion, state, signals, execution, analytics, and replay. 7. Live workflow What runs on every 
data update, how zones arm, and how trades are managed. 8. Dashboard, alerts, execution UI modules, 
alert rules, order logic, and smart exit behavior. 1. Operating objectives and product standards 
The engine should behave like an institutional decision system, not a retail indicator. Its job is 
to convert raw market behavior into ranked trade opportunities that are explainable, measurable, 
and execution-ready. Find supply and demand zones as origin events, not just as rectangles drawn 
after the fact. Require proof of imbalance through displacement, inefficiency, participation, and, 
where available, order-book asymmetry. Track every zone through a lifecycle so freshness, 
mitigation, and consumption are always explicit. Use higher-timeframe context to decide which zones 
matter and lower-timeframe structure to decide when entries are allowed. Score every zone and every 
retest; never allow an unranked touch to become an automatic trade. Preserve enough data to replay, 
label, audit, and continuously improve the engine. Non-negotiable qualities for a world-class 
build: Real-time operation with deterministic state updates. Multi-timeframe logic with 
parent-child zone alignment. Microstructure awareness through tick, trade, spread, and depth 
features where available. Risk-aware decisioning with clear invalidation logic and exposure 
controls. Full observability: every decision, feature snapshot, alert, and order event is stored. 
2. Complete architecture The platform is easiest to reason about as nine cooperating layers. The 
first four transform market data into state; the next three turn state into decisions; the final 
two turn decisions into learning. Figure 1. End-to-end architecture from market data through 
learning. Layer Primary responsibility Outputs 1. Market feeds Ingest candles, ticks, trades, 
spread, depth, and calendar events. Normalized raw events 2. Ingestion &amp; normalization Validate 
timestamps, map symbols, handle missing fields, and write canonical streams. Clean stream topics 
and historical partitions 3. Feature fabric Compute ATR, swings, FVG, spread regime, delta, 
volatility, and liquidity maps. Feature snapshots 4. Core intelligence Detect zones, classify 
imbalance, map structure, and update zone lifecycle. Zone objects and state transitions 5. 
Persistent state Store zones, signals, trades, models, analytics, and event history. Durable system 
memory 6. Scoring &amp; risk Calculate institutional score, apply filters, and determine risk 
budget. Ranked opportunities 7. Decision layer Choose watch, alert, paper trade, or live execution. 
Actionable signals 8. Execution router Submit, amend, and cancel orders; manage stops and targets. 
Broker events and fills 9. Analytics &amp; learning Replay sessions, label outcomes, train ranking 
models, and generate performance reports. Feedback to research and production Deployment topology A 
streaming process subscribes to live data and emits normalized events into a message bus or Redis 
streams. A real-time computation service maintains rolling features and emits time-sliced feature 
snapshots per symbol and timeframe. Zone intelligence workers subscribe to feature updates, mutate 
zone state, and publish new opportunities. An execution service is isolated from the research layer 
and only receives pre-approved trade instructions plus current risk context. A PostgreSQL cluster 
stores durable state; Redis keeps hot state for low-latency reads; object storage keeps replay 
artifacts and model files. A monitoring stack tracks process health, lag, feature gaps, alert 
throughput, and broker acknowledgements. 3. Database schema The database is the engine's memory. It 
must support three different workloads at once: live decisioning, historical replay, and 
machine-learning labeling. The schema below assumes PostgreSQL for durable state, partitioned 
time-series tables for market data, and Redis for hot state and ephemeral queues. Figure 2. Core 
operational schema groups. 3.1 Core tables Table Purpose Primary keys / important columns symbols 
Static reference data for instruments and venue mapping. symbol_id, symbol_code, asset_class, 
tick_size, contract_size candles Partitioned OHLCV by timeframe. symbol_id, timeframe, ts, open, 
high, low, close, volume ticks Best bid/ask and last-trade microstructure stream. symbol_id, ts, 
bid, ask, last, spread, trade_size book_snapshots Depth or MBP snapshots for order-book imbalance. 
symbol_id, ts, bid_levels, ask_levels, imbalance_raw zones Canonical zone registry with state, 
boundaries, score, and context. zone_id, symbol_id, timeframe, type, proximal, distal, state, 
institutional_score zone_state_history Append-only lifecycle transitions for each zone. zone_id, 
event_ts, old_state, new_state, reason zone_retests Every touch or mitigation event with response 
metrics. retest_id, zone_id, touch_ts, depth_pct, reaction_score, result signals Decision layer 
outputs before order creation. signal_id, zone_id, grade, action, confidence, expiry_ts 
trade_setups Planned entries, stop logic, targets, and sizing. setup_id, signal_id, entry_type, 
entry_price, stop_price, target_schema orders Broker-facing order ledger. order_id, setup_id, 
broker_ref, side, order_type, qty, limit_price, status fills Partial and complete execution 
records. fill_id, order_id, fill_ts, fill_price, fill_qty positions Open and closed position state. 
position_id, setup_id, avg_price, realized_pnl, unrealized_pnl, status exits Exit actions, reasons, 
and trigger data. exit_id, position_id, exit_type, exit_reason, trigger_snapshot feature_vectors 
Scoring inputs captured at decision time. vector_id, symbol_id, ts, timeframe, feature_json, 
model_version alerts Delivered alerts and acknowledgement state. alert_id, signal_id, channel, 
delivered_ts, ack_ts backtest_runs Experiment metadata for replay runs. run_id, strategy_version, 
dataset_id, metrics_json model_versions Ranking model lineage and deployment status. model_version, 
training_window, auc, calibration_json, active_flag 3.2 Recommended detailed fields for the 
highest-value tables zones column Type Meaning zone_id UUID / text Unique identifier stable across 
live and replay contexts. symbol_id FK Instrument reference. timeframe text Origin timeframe such 
as 5m, 15m, 1h. zone_type text Supply or demand. origin_ts timestamp Time of zone creation at close 
of the qualifying base/departure event. proximal numeric Nearest edge of the zone for entry logic. 
distal numeric Far edge of the zone and stop anchor. midpoint numeric Equilibrium reference used 
for penetration analysis. base_candles smallint Count of candles in the base cluster. 
departure_atr_multiple numeric Distance of initial displacement relative to ATR. fvg_size numeric 
Gap or inefficiency size in ticks or price units. bos_flag boolean Whether departure broke 
important structure. sweep_flag boolean Whether liquidity was swept before departure. 
freshness_state text NEW, FRESH, ARMED, TOUCHED, MITIGATED, CONSUMED, INVALIDATED. retest_count 
smallint How many times price has revisited. institutional_score numeric Final weighted score, 0 to 
100. grade text A+, A, B, Watch, Ignore. feature_snapshot_id FK Reference to the vector captured at 
creation. trade_setups column Type Meaning setup_id UUID Execution-ready setup ID. signal_id FK 
Source signal. entry_type text Touch, confirm, micro-BOS, FVG reclaim, limit ladder. 
entry_zone_portion text Proximal, midpoint, distal third, or adaptive. entry_price numeric Primary 
entry price. stop_price numeric Invalidation price. target_schema jsonb Primary TP, scale-outs, 
trail rules, opposing-zone logic. rr_floor numeric Minimum reward-to-risk required. 
max_hold_minutes integer Time stop for intraday setups. risk_budget_bps numeric Portfolio risk 
allocated to the setup. broker_policy text Market, passive limit, synthetic stop, etc. 3.3 
Indexing, retention, and hot-state strategy Partition candles, ticks, and book_snapshots by date 
and symbol family to keep replay and live reads fast. Index zones on (symbol_id, timeframe, 
freshness_state, grade, institutional_score desc) for dashboard and alert reads. Index zone_retests 
on (zone_id, touch_ts desc) and signals on (action, expiry_ts, delivered=false). Keep the latest 
active zones, active signals, open positions, and current spread regime in Redis for millisecond 
reads. Retain raw tick and depth data in hot storage only as long as needed for the intraday 
engine; archive old partitions to object storage for later replay. 4. Scoring formulas The score 
should be additive, explainable, and decomposable. Each component receives a raw score in the range 
0 to 100, then a weighted final score is produced. Grades are derived from the final score and a 
minimum-filter checklist. Component Weight What it measures Formation score 0.18 Compression 
quality and cleanliness of the base. Displacement score 0.19 How forcefully price left the zone. 
Imbalance score 0.21 Visible inefficiency, participation, and order-book asymmetry. Structure score 
0.15 BOS/CHoCH, sweep behavior, and higher-timeframe alignment. Freshness score 0.10 How much of 
the original order inventory is likely left. Retest quality score 0.10 Current revisit quality and 
confirmation behavior. Context score 0.07 Session quality, spread regime, news filter, and 
opposing-zone distance. Recommended formulas formation_score = 40 * compression_ratio_score + 25 * 
overlap_ratio_score + 20 * candle_symmetry_score + 15 * base_duration_score displacement_score = 35 
* norm(departure_atr_multiple, 0.8, 3.0) + 25 * impulse_velocity_score + 20 * 
close_efficiency_score + 20 * low_overlap_after_departure_score imbalance_score = 30 * fvg_score + 
20 * skipped_price_score + 20 * volume_zscore_score + 20 * book_imbalance_score + 10 * 
liquidity_vacuum_score structure_score = 35 * bos_score + 20 * choch_score + 20 * sweep_score + 25 
* htf_alignment_score freshness_score = 50 * untouched_score + 20 * first_touch_bonus + 15 * (1 - 
penetration_depth_pct) + 15 * (1 - normalized_retest_count) retest_quality_score = 30 * 
approach_quality_score + 20 * rejection_speed_score + 20 * lower_tf_confirmation_score + 15 * 
time_in_zone_score + 15 * spread_acceptability_score context_score = 30 * session_score + 25 * 
news_safety_score + 20 * opposing_zone_distance_score + 15 * correlation_alignment_score + 10 * 
volatility_regime_score Final institutional score institutional_score = 0.18 * formation_score + 
0.19 * displacement_score + 0.21 * imbalance_score + 0.15 * structure_score + 0.10 * 
freshness_score + 0.10 * retest_quality_score + 0.07 * context_score grade = A+ if score &gt;= 90 
and imbalance_score &gt;= 75 and freshness_score &gt;= 70 A if score &gt;= 80 and imbalance_score 
&gt;= 65 B if score &gt;= 65 WATCH if score &gt;= 55 but one hard filter blocks execution IGNORE 
otherwise Normalization rules Use clipped min-max normalization for stable, bounded inputs such as 
ATR multiples or spread percentiles. Use z-scores for volume, delta, and participation features, 
but cap them to prevent one outlier from dominating the score. Require a hard fail when spread, 
slippage, or news risk is outside tolerated bounds, even if the weighted score is high. Recompute 
retest_quality_score and context_score live; keep formation, displacement, and initial imbalance 
fixed after creation. Persist the full component vector so every grade can be audited or re-scored 
later. 5. Detection pseudocode The pseudocode below is intentionally operational. It describes how 
the production engine should think, not just how a notebook should backtest. 5.1 Zone discovery def 
detect_candidate_zones(symbol, timeframe, candles, feature_state): swings = compute_swings(candles) 
atr = feature_state.atr candidates = [] for i in range(6, len(candles) - 3): base = 
candles[i-4:i+1] if not is_compressed_base(base, atr): continue departure = candles[i+1:i+4] 
direction = classify_departure(base, departure) if direction not in {"supply", "demand"}: continue 
departure_metrics = measure_departure(base, departure, atr) if departure_metrics.atr_multiple &lt; 
1.0: continue zone = build_zone_object(symbol, timeframe, base, departure, swings, 
departure_metrics) if zone.proximal == zone.distal: continue candidates.append(zone) return 
candidates 5.2 Imbalance verification def verify_imbalance(zone, candles, trades=None, book=None): 
zone.fvg_size = detect_fvg_size(candles, zone.origin_index) zone.skipped_price_ratio = 
calc_skipped_price_ratio(candles, zone.origin_index) zone.volume_zscore = 
calc_volume_zscore(candles, zone.origin_index) if trades is not None: zone.aggressive_trade_burst = 
detect_trade_burst(trades, zone.origin_ts) if book is not None: zone.book_imbalance_score = 
measure_book_imbalance(book, zone.origin_ts) zone.liquidity_vacuum_score = 
detect_liquidity_withdrawal(book, zone.origin_ts) zone.imbalance_score = score_imbalance(zone) 
zone.is_imbalanced = zone.imbalance_score &gt;= 65 return zone 5.3 Lifecycle updates def 
update_zone_state(zone, current_price, current_ts): if price_has_broken_distal(zone, 
current_price): transition(zone, "INVALIDATED", reason="distal_break") return zone if 
price_has_touched(zone, current_price) and zone.state in {"NEW", "FRESH", "ARMED"}: penetration = 
penetration_depth_pct(zone, current_price) zone.retest_count += 1 if penetration &lt; 0.33: 
transition(zone, "TOUCHED", reason="shallow_touch") elif penetration &lt; 0.75: transition(zone, 
"PARTIALLY_MITIGATED", reason="deep_touch") else: transition(zone, "CONSUMED", 
reason="inventory_likely_absorbed") return zone 5.4 Retest validation and signal generation def 
evaluate_retest(zone, live_context): if zone.grade not in {"A+", "A", "B"}: return None if 
zone.state in {"CONSUMED", "INVALIDATED"}: return None if live_context.news_blocked or 
live_context.spread_too_wide: return make_watch_signal(zone, reason="context_block") retest = 
measure_retest(zone, live_context) zone.retest_quality_score = score_retest(retest) total = 
recompute_live_score(zone, live_context, retest) if total &gt;= 90 and retest.lower_tf_confirmed: 
return make_signal(zone, action="EXECUTE", confidence=total) if total &gt;= 80: return 
make_signal(zone, action="ALERT", confidence=total) if total &gt;= 65: return make_signal(zone, 
action="WATCH", confidence=total) return None 5.5 Smart exit manager def manage_position(position, 
market, zone, policy): if market.last_price &lt;= position.stop_price and position.side == "LONG": 
return exit_market(position, reason="hard_stop") if market.last_price &gt;= position.stop_price and 
position.side == "SHORT": return exit_market(position, reason="hard_stop") if 
reached_primary_target(position, market): scale_out(position, pct=policy.first_scale_pct, 
reason="target_1_hit") tighten_stop(position, mode="breakeven_plus_buffer") if 
opposite_aggression_detected(market, position.side): tighten_stop(position, mode="micro_structure") 
if zone_has_failed_contextually(zone, market): return exit_market(position, reason="zone_failure") 
if time_stop_expired(position, market.ts, policy.max_hold_minutes): return exit_market(position, 
reason="time_stop") return hold(position) 6. API routes The API surface should separate low-latency 
internal writes from operator-facing reads. In practice, internal services may speak over gRPC or a 
message bus while the dashboard uses HTTP, but the route design below keeps the business objects 
stable. Method Route Purpose Typical response POST /v1/ingest/candles Load or append candles for 
backfill and replay. accepted batch id POST /v1/ingest/ticks Append normalized tick packets. 
accepted count POST /v1/ingest/book-snapshots Append order-book depth snapshots. accepted count GET 
/v1/symbols List supported instruments and metadata. symbol reference list GET /v1/zones/active 
Return active zones with score, state, and nearest distance. paged zone list GET 
/v1/zones/{zone_id} Fetch one zone, full feature vector, and lifecycle history. zone detail GET 
/v1/zones/{zone_id}/retests Show touch events and reactions. retest ledger GET /v1/signals/live 
Current watch, alert, and execute signals. signal list POST /v1/signals/{signal_id}/ack Acknowledge 
alert in operator workflow. updated signal POST /v1/setups Create an execution-ready setup from a 
signal. setup object POST /v1/orders Submit an order to the broker bridge. order status PATCH 
/v1/orders/{order_id} Amend limit, stop, target, or quantity. updated order DELETE 
/v1/orders/{order_id} Cancel open order. canceled status GET /v1/positions/open List open positions 
with live PnL and exit policy. position list POST /v1/positions/{position_id}/exit Force a 
discretionary or policy-based exit. exit ticket GET /v1/analytics/performance Performance by 
symbol, grade, session, and version. metrics bundle POST /v1/replay/runs Launch a backtest or 
historical replay. run id GET /v1/replay/runs/{run_id} Replay status and metrics. run detail GET 
/v1/models/active Current model versions and calibration stats. model registry Example signal 
payload { "signal_id": "sig_01J...", "zone_id": "zon_01J...", "symbol": "EURUSD", "timeframe": 
"15m", "action": "ALERT", "grade": "A", "institutional_score": 84.7, "components": { "formation": 
79, "displacement": 88, "imbalance": 86, "structure": 72, "freshness": 83, "retest_quality": 65, 
"context": 74 }, "entry_model": "micro_bos_confirm", "entry_price": 1.08724, "stop_price": 1.08668, 
"targets": [1.08812, 1.08894], "expires_at": "2026-04-20T15:30:00Z" } 7. Live engine workflow The 
live workflow is a state machine wrapped around streaming data. Every incoming tick or bar update 
can change a zone's distance, score, state, or readiness. The engine should be deterministic: given 
the same data, it should produce the same state transitions. Figure 3. Live workflow from data 
update to smart exit. Receive a new event packet: candle close, tick, trade burst, spread change, 
or order-book snapshot. Refresh incremental features for all affected timeframes and symbols. Run 
zone discovery only on bars or structural feature updates; do not scan the full history every tick. 
For each active zone, update distance-to-zone, penetration, and lifecycle state. If price enters 
the arming window, compute current retest-quality and context scores. If hard filters fail, mark 
the zone WATCH and continue monitoring. If score and confirmation pass thresholds, emit a signal 
and optionally create a trade setup. If auto-execution is enabled, pass the setup to the execution 
router with current risk limits. While the position is open, recalculate exit conditions on each 
relevant update and store every management event. At close, label the outcome, update the analytics 
store, and make the trade available to replay and model training. Recommended worker split Worker 
Trigger Main work Latency target Feature worker Tick/bar/depth event Update ATR, swings, FVG, 
spread regime, volatility maps. &lt; 20 ms Zone worker Bar close / structural event Create zones, 
verify imbalance, update score skeleton. &lt; 40 ms Retest worker Price enters arming window 
Measure current approach and confirmation state. &lt; 25 ms Decision worker New retest score Emit 
watch, alert, or execute signal. &lt; 10 ms Execution worker Signal or broker event Create orders, 
monitor fills, manage exits. &lt; 20 ms Analytics worker Signal/trade close Persist labels, 
metrics, and learning artifacts. async 8. Dashboard structure A world-class engine needs a control 
room. The dashboard should let the operator understand what the engine sees, why it scored a zone 
the way it did, and how current positions are being managed. Panel Purpose Key widgets Zone radar 
Live inventory of fresh and armed zones. symbol, timeframe, grade, state, distance, imbalance badge 
Zone detail Explain a selected zone. boundaries, origin chart, component scores, feature vector, 
lifecycle timeline Retest monitor Show zones approaching actionability. distance meter, approach 
quality, lower-TF confirmation, spread Execution blotter Track setups, orders, fills, and open 
positions. entry, stop, targets, fill state, realized/unrealized PnL Risk monitor Keep exposure and 
correlation visible. daily loss, symbol concentration, correlated exposure, blocked states Replay 
lab Reconstruct historical sessions and decisions. time scrubber, chart replay, signals, outcomes, 
notes Model &amp; analytics Performance attribution and ML governance. win rate by grade, 
calibration, model version, drift warnings Recommended page layout Top strip: portfolio state, risk 
usage, live spread regime, and system heartbeat. Left rail: active zones filtered by asset, 
timeframe, state, and grade. Center canvas: chart with parent-child zones, FVG overlays, structure 
labels, and alert markers. Right rail: score decomposition, retest checklist, execution controls, 
and current trade journal. Bottom tabs: orders, fills, alerts, lifecycle history, feature 
snapshots, and replay notes. 9. Alert logic Alerts should be sparse, high-signal, and stateful. The 
operator should never receive five alerts for the same zone unless the state materially changed. 
Alert level Trigger condition Delivery policy Watch Zone score &gt;= 65 and price within arming 
distance, but confirmation incomplete. Dashboard only Alert Score &gt;= 80, freshness valid, and no 
hard risk blocks. Dashboard + push / desktop Execute-ready Score &gt;= 90 and lower-timeframe 
trigger confirmed. Priority push + order panel highlight Risk warning Spread, slippage, news, or 
exposure block a normally valid setup. Dashboard + operator notification Management event 
Scale-out, stop tighten, time stop, or contextual failure. Blotter + optional push Alert 
deduplication policy Use a compound key of zone_id + alert_level + state version so only materially 
new conditions produce a new delivery. Escalate Watch to Alert or Alert to Execute-ready; do not 
resend the same state at the same level. Expire alerts when the zone is invalidated, consumed, or 
moved too far away for the current session. Attach the current component score vector and 
hard-filter status to every alert so operators see why it fired. 10. Execution logic Execution 
logic converts a signal into a position while preserving risk discipline. The engine should support 
both semi-automatic and fully automatic modes. Stage Decision rule Implementation note Setup 
creation Only A or A+ signals become trade setups by default. Allow B-grade only in research or 
simulation mode. Entry model Choose touch, confirmation, micro-BOS, or FVG reclaim based on 
volatility and signal policy. Store the chosen model explicitly in trade_setups. Sizing Risk is 
based on stop distance, portfolio budget, and symbol correlation. Cap notional and total concurrent 
exposure. Order type Use passive limits in orderly markets; use aggressive/market orders only when 
confirmation speed matters. Execution policy lives outside the model so it can change without 
re-scoring zones. Stop placement Distal line plus volatility buffer or microstructure invalidation. 
Stops should represent the idea failing, not arbitrary noise. Targeting First target at logical 
liquidity or opposing zone; second target can trail. Allow partial exits and stop ratchets. 
Execution decision pseudocode if signal.action != "EXECUTE": do_not_trade() setup = 
build_trade_setup(signal, policy, risk_limits) if not passes_portfolio_checks(setup): 
downgrade_to_watch(signal, reason="portfolio_block") order_plan = choose_order_plan(setup, 
spread_regime, liquidity_state) submit_primary_order(order_plan) 
register_protective_stop(setup.stop_price) register_targets(setup.target_schema) 
start_position_supervisor(setup.setup_id) 11. Smart exit logic The best exit framework is layered. 
It combines hard invalidation with progressive information: achieved reward, opposite aggression, 
loss of structural support, and simple time decay. Exit type Condition Typical action Hard stop 
Distal breach or explicit invalidation condition. Immediate exit. Scale-out 1 Primary target or 1R 
reached. Take partial profit and tighten stop. Scale-out 2 Secondary target, opposing liquidity, or 
opposing zone touch. Take more profit or fully exit. Contextual failure Zone reaction stalls, 
opposite aggression spikes, or lower-TF structure flips. Reduce or exit early. Time stop Expected 
reaction window elapsed without progress. Close the position and free risk budget. Trail Trend 
continues after scale-out and market remains efficient. Trail behind micro swings or volatility 
bands. Recommended smart-exit policy After first scale-out, move the stop to breakeven plus a 
buffer only if structure remains supportive; avoid instant stop moves in noisy environments. Use 
lower-timeframe microstructure to tighten stops only after the trade has proven itself with 
displacement away from the zone. Exit early when the market re-enters the zone deeply after a 
supposed reaction; deep re-entry often means the zone is being consumed. When an opposing 
higher-timeframe zone is very near, bias toward taking profits rather than demanding a full trend 
continuation. Keep a distinct exit_reason field so later analytics can separate good stop 
discipline from avoidable early exits. 12. Build roadmap and implementation order To get to 
world-class quality without overbuilding too early, the system should be developed in layers that 
preserve explainability. Phase Deliverables Exit criteria Phase 1 Candle-based zone detector, FVG 
logic, BOS logic, lifecycle state machine, dashboard inventory. Stable active-zone registry and 
replay parity. Phase 2 Retest scoring, alert engine, operator dashboard, performance journal. 
Alerts match replay and manual review. Phase 3 Execution router, order ledger, stop/target manager, 
risk controls. Paper trading or sim shows deterministic behavior. Phase 4 Tick/trade participation 
metrics and smart exits. Execution quality and exit reasons fully observable. Phase 5 Order-book 
imbalance, model ranking, adaptive thresholds, ML monitoring. Ranking improves quality without 
breaking interpretability. Definition of done for production readiness Every live signal can be 
traced to an immutable feature snapshot and a versioned scoring policy. Replay over the same 
historical data reproduces the same zones, scores, and signal decisions. Alerts are sparse enough 
to be trusted and rich enough to be acted on immediately. Position management emits a complete 
management timeline with explicit exit reasons. Performance can be segmented by symbol, session, 
grade, retest count, and model version. Appendix A. Canonical zone object { "zone_id": 
"XAUUSD_15M_DEMAND_2026_04_20_1015_001", "symbol": "XAUUSD", "timeframe": "15m", "zone_type": 
"demand", "origin_ts": "2026-04-20T10:15:00Z", "proximal": 3318.20, "distal": 3315.80, "midpoint": 
3317.00, "base_candles": 3, "departure_atr_multiple": 2.6, "fvg_present": true, "fvg_size": 1.85, 
"bos_flag": true, "sweep_flag": true, "freshness_state": "FRESH", "retest_count": 0, 
"formation_score": 84, "displacement_score": 89, "imbalance_score": 86, "structure_score": 78, 
"freshness_score": 92, "retest_quality_score": 0, "context_score": 0, "institutional_score": 88.5, 
"grade": "A", "status": "ARMED" } 