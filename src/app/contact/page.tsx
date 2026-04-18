"use client";

import { useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
        <h1 className="text-4xl font-bold mb-2">Contact Us</h1>
        <p className="text-muted-light mb-8">Have a question, feedback, or partnership inquiry? We'd love to hear from you.</p>

        {submitted ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-8 text-center">
            <p className="text-lg font-semibold text-emerald-400 mb-2">Message Sent</p>
            <p className="text-sm text-muted-light">Thank you for reaching out. We'll get back to you as soon as possible.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm text-muted-light block mb-1.5">Name</label>
              <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-accent/50" placeholder="Your name" />
            </div>
            <div>
              <label className="text-sm text-muted-light block mb-1.5">Email</label>
              <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-accent/50" placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-sm text-muted-light block mb-1.5">Subject</label>
              <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-accent/50">
                <option value="">Select a topic</option>
                <option value="general">General Inquiry</option>
                <option value="support">Technical Support</option>
                <option value="billing">Billing</option>
                <option value="partnership">Partnership</option>
                <option value="feedback">Feedback</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-light block mb-1.5">Message</label>
              <textarea required rows={5} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl text-foreground text-sm focus:outline-none focus:border-accent/50 resize-none" placeholder="How can we help?" />
            </div>
            <button type="submit" className="w-full px-6 py-3 bg-accent hover:bg-accent-light text-white font-semibold rounded-xl transition-smooth">
              Send Message
            </button>
          </form>
        )}

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-surface rounded-xl border border-border/50 p-5">
            <p className="text-sm font-semibold mb-1">Email</p>
            <p className="text-sm text-muted-light">support@tradewithvic.com</p>
          </div>
          <div className="bg-surface rounded-xl border border-border/50 p-5">
            <p className="text-sm font-semibold mb-1">Response Time</p>
            <p className="text-sm text-muted-light">Within 24 hours</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
