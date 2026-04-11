/*
 * ═══════════════════════════════════════════════════════════════
 *  NOODIXX  –  BACKEND DATA LAYER  (db.js)
 *
 *  Responsibilities:
 *    • localStorage database engine (users, sessions, conversations)
 *    • App configuration (EmailJS keys, seed profiles)
 *    • All data read/write operations
 *
 *  In a production app this module would be replaced by a real
 *  server-side API (Node/Express, Java Spring, etc.) with a MySQL
 *  or PostgreSQL database. The public interface (DB object) would
 *  remain identical — only the storage mechanism changes.
 *
 *  Schema
 *  ──────
 *  od_users          → JSON[]   User records
 *  od_conversations  → JSON{}   Messages keyed by sorted email pair
 *  od_session        → string   Email of logged-in user
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ───────────────────────────────────────────────────────────────
//  CONFIG  –  third-party service credentials
// ───────────────────────────────────────────────────────────────
const CONFIG = {
    // EmailJS  →  https://www.emailjs.com
    EJS_PUBLIC:   'X7BQBpgowD_Fbtk7_',
    EJS_SERVICE:  'service_lqgrye1',
    EJS_TEMPLATE: 'template_2p5xkpo',
    NOTIFY_EMAIL: 'newthings334@gmail.com',

    // Gemini (kept for reference; chatbot now uses EmailJS only)
    GEMINI_KEY: 'AIzaSyCGq4pSrZZXYxUBfIwNQ_W9m1Hc0EIxiBg',
    get GEMINI_URL() {
        return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.GEMINI_KEY}`;
    }
};

// ───────────────────────────────────────────────────────────────
//  SEED DATA  –  demo profiles (never stored in localStorage)
// ───────────────────────────────────────────────────────────────
const SEED = [
    { name:'Aisha', age:24, email:'aisha@demo.com', img:'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=500&auto=format&fit=crop', height:'165', type:'Athletic', looking:'Long-term relationship' },
    { name:'Kwame', age:28, email:'kwame@demo.com', img:'https://images.unsplash.com/photo-1506803682981-6e718a9dd3ee?w=500&auto=format&fit=crop', height:'180', type:'Fit',      looking:'Casual dating' },
    { name:'Zola',  age:26, email:'zola@demo.com',  img:'https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=500&auto=format&fit=crop', height:'170', type:'Curvy',    looking:'Friendship first' },
    { name:'Malik', age:30, email:'malik@demo.com', img:'https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?w=500&auto=format&fit=crop', height:'185', type:'Average',  looking:'Long-term relationship' }
];

// ───────────────────────────────────────────────────────────────
//  DB  –  client-side database engine
// ───────────────────────────────────────────────────────────────
const DB = {

    // ── USERS ─────────────────────────────────────────────────
    getUsers() {
        return JSON.parse(localStorage.getItem('od_users') || '[]');
    },
    saveUsers(users) {
        localStorage.setItem('od_users', JSON.stringify(users));
    },
    findUser(email) {
        return this.getUsers().find(u => u.email === email.toLowerCase());
    },
    registerUser(user) {
        const users = this.getUsers();
        if (users.find(u => u.email === user.email)) return false;
        users.push(user);
        this.saveUsers(users);
        return true;
    },
    updateUser(email, fields) {
        const users = this.getUsers();
        const idx   = users.findIndex(u => u.email === email.toLowerCase());
        if (idx === -1) return false;
        Object.assign(users[idx], fields);
        this.saveUsers(users);
        return true;
    },

    // ── SESSION ───────────────────────────────────────────────
    getSession() {
        return localStorage.getItem('od_session') || null;
    },
    setSession(email) {
        localStorage.setItem('od_session', email);
    },
    clearSession() {
        localStorage.removeItem('od_session');
    },
    currentUser() {
        const email = this.getSession();
        return email ? this.findUser(email) : null;
    },

    // ── CONVERSATIONS ─────────────────────────────────────────
    convKey(a, b) {
        return [a, b].sort().join('|||');
    },
    getAllConvs() {
        return JSON.parse(localStorage.getItem('od_conversations') || '{}');
    },
    getConv(a, b) {
        return this.getAllConvs()[this.convKey(a, b)] || [];
    },
    addMsg(a, b, msg) {
        const all = this.getAllConvs();
        const key = this.convKey(a, b);
        if (!all[key]) all[key] = [];
        all[key].push(msg);
        localStorage.setItem('od_conversations', JSON.stringify(all));
    },
    markRead(a, b, reader) {
        const all = this.getAllConvs();
        const key = this.convKey(a, b);
        if (!all[key]) return;
        all[key].forEach(m => { if (m.to === reader) m.read = true; });
        localStorage.setItem('od_conversations', JSON.stringify(all));
    }
};
