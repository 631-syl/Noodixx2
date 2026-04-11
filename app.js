/*
 * ═══════════════════════════════════════════════════════════════
 *  NOODIXX  –  FRONTEND APPLICATION LOGIC  (app.js)
 *
 *  Responsibilities:
 *    • Page navigation & browser history
 *    • Rendering profile cards, chat list, messages
 *    • Registration & sign-in form handling
 *    • Profile modal (view / edit)
 *    • Inbox & messaging UI
 *    • Voice notes & call overlays
 *    • Dropdown menu behaviour
 *    • Support chatbot (EmailJS)
 *    • Tips carousel
 *
 *  Depends on: db.js  (must be loaded first)
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ───────────────────────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────────────────────
function avatarURL(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=FF5722&color=fff&size=400`;
}
function nowStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function showErr(el, msg) {
    el.textContent   = msg;
    el.style.display = 'block';
}

// ───────────────────────────────────────────────────────────────
//  RUNTIME STATE
// ───────────────────────────────────────────────────────────────
let activeChat       = null;
let isRecording      = false;
let recordingTimer   = null;
let recordingSeconds = 0;
let isMuted          = false;
let isCamOff         = false;
let callTimer        = null;

// ───────────────────────────────────────────────────────────────
//  NAVIGATION
// ───────────────────────────────────────────────────────────────
function _showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
    if (id === 'chat')  renderChatList();
    if (id === 'home')  renderProfiles();
    if (id === 'inbox') renderMessages();
}

function navigateTo(id) {
    _showPage(id);
    history.pushState({ page: id }, '', '#' + id);
}

// Browser back button: register / signin / chat → home
window.addEventListener('popstate', function (e) {
    const page       = e.state?.page;
    const backToHome = ['register', 'signin', 'chat'];
    if (!page || backToHome.includes(page)) {
        _showPage('home');
        history.replaceState({ page: 'home' }, '', '#home');
    } else {
        _showPage(page);
    }
});

// ───────────────────────────────────────────────────────────────
//  NAV UI
// ───────────────────────────────────────────────────────────────
function updateNavUI() {
    const user     = DB.currentUser();
    const badge    = document.getElementById('nav-user-badge');
    const nameSpan = document.getElementById('nav-user-name');
    const miniImg  = document.getElementById('nav-avatar-mini');
    const logout   = document.getElementById('nav-logout');
    const register = document.getElementById('nav-register');
    const signin   = document.getElementById('nav-signin');

    if (user) {
        nameSpan.textContent = user.name.split(' ')[0];
        miniImg.src          = user.img || avatarURL(user.name);
        miniImg.onerror      = () => { miniImg.src = avatarURL(user.name); };
        badge.style.display    = 'inline-flex';
        register.style.display = 'none';
        signin.style.display   = 'none';
        logout.style.display   = 'block';
    } else {
        badge.style.display    = 'none';
        register.style.display = 'block';
        signin.style.display   = 'block';
        logout.style.display   = 'none';
    }
}

function logOut() {
    DB.clearSession();
    updateNavUI();
    navigateTo('home');
}

// ───────────────────────────────────────────────────────────────
//  DROPDOWN MENU  –  click-open, 4 s auto-close, 2 s fade-out
// ───────────────────────────────────────────────────────────────
let dropTimer     = null;
let dropFadeTimer = null;

function toggleDropdown(e) {
    e.stopPropagation();
    const menu   = document.getElementById('dropdown-menu');
    const isOpen = menu.style.display === 'block';
    isOpen ? dropClose() : dropOpen();
}

function dropOpen() {
    clearTimeout(dropTimer);
    clearTimeout(dropFadeTimer);
    const menu = document.getElementById('dropdown-menu');
    menu.classList.remove('fading');
    menu.style.display = 'block';
    menu.style.opacity = '1';
    // Start fade after 4 s; fade lasts 2 s
    dropTimer = setTimeout(() => {
        menu.classList.add('fading');
        dropFadeTimer = setTimeout(() => {
            menu.style.display = 'none';
            menu.classList.remove('fading');
        }, 2000);
    }, 4000);
}

function dropClose() {
    clearTimeout(dropTimer);
    clearTimeout(dropFadeTimer);
    const menu = document.getElementById('dropdown-menu');
    menu.style.display = 'none';
    menu.classList.remove('fading');
    menu.style.opacity = '1';
}

document.addEventListener('click', function (e) {
    const dd = document.getElementById('main-dropdown');
    if (dd && !dd.contains(e.target)) dropClose();
});

// ───────────────────────────────────────────────────────────────
//  PROFILE CARDS
// ───────────────────────────────────────────────────────────────
function renderProfiles() {
    const feed       = document.getElementById('profile-feed');
    const me         = DB.currentUser();
    const seedEmails = SEED.map(p => p.email);

    const regUsers = DB.getUsers()
        .filter(u => !seedEmails.includes(u.email))
        .map(u => ({
            name: u.name, age: u.age, email: u.email,
            img: u.img || '', height: u.height + 'cm',
            type: u.type, looking: u.looking
        }));

    const all = [...SEED.map(s => ({ ...s, height: s.height + 'cm' })), ...regUsers];

    feed.innerHTML = all.map(p => {
        const isSelf  = me && me.email === p.email;
        const canChat = me && !isSelf;
        const imgSrc  = p.img || avatarURL(p.name);

        const actions = isSelf
            ? `<span style="font-size:0.82rem;color:#bbb;padding:8px 0;">✓ Your profile</span>`
            : canChat
                ? `<button class="btn-icon" onclick="openInbox('${p.email}')">💬 Message</button>
                   <button class="btn-icon" onclick="startVoiceCall('${p.name}')">Voice Call</button>
                   <button class="btn-icon" onclick="startVideoCall('${p.name}')">Video Call</button>`
                : `<button class="btn-icon" onclick="navigateTo('signin');return false;">Sign in to message</button>`;

        return `
            <div class="profile-card">
                <img src="${imgSrc}" alt="${escapeHTML(p.name)}" class="profile-img"
                     onerror="this.src='${avatarURL(p.name)}'">
                <div class="profile-info">
                    <h3>${escapeHTML(p.name)}, ${p.age}</h3>
                    <div class="tags">
                        <span class="tag">${p.height}</span>
                        <span class="tag">${escapeHTML(p.type)}</span>
                    </div>
                    <p style="font-size:0.9rem;color:#555;">
                        <strong>Looking for:</strong> ${escapeHTML(p.looking)}
                    </p>
                    <div class="profile-action">${actions}</div>
                </div>
            </div>`;
    }).join('');
}

// ───────────────────────────────────────────────────────────────
//  PROFILE MODAL  (view & edit own profile)
// ───────────────────────────────────────────────────────────────
function openProfileModal() {
    const user = DB.currentUser();
    if (!user) return;

    document.getElementById('pf-name').value    = user.name    || '';
    document.getElementById('pf-email').value   = user.email   || '';
    document.getElementById('pf-age').value     = user.age     || '';
    document.getElementById('pf-height').value  = user.height  || '';
    document.getElementById('pf-type').value    = user.type    || '';
    document.getElementById('pf-looking').value = user.looking || '';

    const photo = document.getElementById('profile-modal-photo');
    photo.src     = user.img || avatarURL(user.name);
    photo.onerror = () => { photo.src = avatarURL(user.name); };
    delete photo.dataset.newImg;

    document.getElementById('profile-save-success').style.display = 'none';
    document.getElementById('profileModalOverlay').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModalOverlay').classList.remove('active');
}

document.getElementById('profileModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeProfileModal();
});

function handleProfilePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        alert('Please upload a PNG or JPEG image only.');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
        const photo  = document.getElementById('profile-modal-photo');
        photo.src    = ev.target.result;
        photo.dataset.newImg = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function saveProfile() {
    const user = DB.currentUser();
    if (!user) return;

    const name    = document.getElementById('pf-name').value.trim();
    const age     = parseInt(document.getElementById('pf-age').value);
    const height  = parseInt(document.getElementById('pf-height').value);
    const type    = document.getElementById('pf-type').value;
    const looking = document.getElementById('pf-looking').value;
    const photo   = document.getElementById('profile-modal-photo');
    const newImg  = photo.dataset.newImg;

    if (!name)           { alert('Name cannot be empty.');           return; }
    if (!age || age < 18){ alert('Please enter a valid age (18+).'); return; }

    const fields = { name, age, height, type, looking };
    if (newImg) fields.img = newImg;

    DB.updateUser(user.email, fields);
    updateNavUI();
    renderProfiles();

    const succ = document.getElementById('profile-save-success');
    succ.style.display = 'block';
    setTimeout(() => { succ.style.display = 'none'; }, 3000);

    delete photo.dataset.newImg;
}

// ───────────────────────────────────────────────────────────────
//  REGISTRATION
// ───────────────────────────────────────────────────────────────
document.getElementById('registrationForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const errorEl   = document.getElementById('reg-error');
    const name      = document.getElementById('reg-name').value.trim();
    const email     = document.getElementById('reg-email').value.trim().toLowerCase();
    const pw        = document.getElementById('reg-password').value;
    const age       = parseInt(document.getElementById('reg-age').value);
    const height    = parseInt(document.getElementById('reg-height').value);
    const type      = document.getElementById('reg-type').value;
    const looking   = document.getElementById('reg-looking').value;
    const photoFile = document.getElementById('reg-photo').files[0];

    if (pw.length < 6) { showErr(errorEl, 'Password must be at least 6 characters.'); return; }
    if (photoFile && !['image/png', 'image/jpeg'].includes(photoFile.type)) {
        showErr(errorEl, 'Profile photo must be a PNG or JPEG file.'); return;
    }
    if (DB.findUser(email)) {
        showErr(errorEl, 'An account with this email already exists. Redirecting to Sign In…');
        setTimeout(() => {
            errorEl.style.display = 'none';
            document.getElementById('signin-email').value = email;
            navigateTo('signin');
        }, 2000);
        return;
    }

    const finish = (imgData) => {
        DB.registerUser({ name, email, password: pw, age, height, type, looking, img: imgData });
        DB.setSession(email);
        updateNavUI();
        this.reset();
        errorEl.style.display = 'none';
        navigateTo('home');
        alert('Welcome to Noodixx.com, ' + name + '! Your account has been created successfully!');
    };

    if (photoFile) {
        const reader = new FileReader();
        reader.onload = ev => finish(ev.target.result);
        reader.readAsDataURL(photoFile);
    } else {
        finish('');
    }
});

// ───────────────────────────────────────────────────────────────
//  SIGN IN
// ───────────────────────────────────────────────────────────────
document.getElementById('signinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const errorEl = document.getElementById('signin-error');
    const email   = document.getElementById('signin-email').value.trim().toLowerCase();
    const pw      = document.getElementById('signin-password').value;
    const user    = DB.findUser(email);

    if (!user || user.password !== pw) {
        showErr(errorEl, 'Incorrect email or password. Please try again.');
        return;
    }
    errorEl.style.display = 'none';
    DB.setSession(email);
    updateNavUI();
    this.reset();
    navigateTo('home');
    alert('Welcome back, ' + user.name + '! 👋');
});

// ───────────────────────────────────────────────────────────────
//  INBOX
// ───────────────────────────────────────────────────────────────
function openInbox(targetEmail) {
    const me = DB.currentUser();
    if (!me) { navigateTo('signin'); return; }

    const target = DB.findUser(targetEmail) || SEED.find(p => p.email === targetEmail);
    if (!target) return;

    activeChat = targetEmail;
    DB.markRead(me.email, targetEmail, me.email);

    document.getElementById('inbox-name').textContent = target.name;
    const av = document.getElementById('inbox-avatar');
    av.src     = target.img || avatarURL(target.name);
    av.onerror = () => { av.src = avatarURL(target.name); };

    navigateTo('inbox');
}

function renderMessages() {
    const me   = DB.currentUser();
    const area = document.getElementById('messages-area');
    if (!me || !activeChat) {
        area.innerHTML = '<p style="text-align:center;color:#bbb;margin:auto;">Sign in to chat.</p>';
        return;
    }
    const msgs = DB.getConv(me.email, activeChat);
    if (!msgs.length) {
        area.innerHTML = '<p style="text-align:center;color:#bbb;margin:auto;">Say hello! Your message will be waiting for them next time they open the app.</p>';
        return;
    }
    area.innerHTML = msgs.map((m, i) => {
        const sent = m.from === me.email;
        if (m.type === 'voice') {
            return `
                <div class="msg-bubble ${sent ? 'sent' : 'received'} voice-note">
                    <button class="voice-play-btn" onclick="playVoice(${i})">▶</button>
                    <div class="voice-bar"><div class="voice-progress" id="vp-${i}"></div></div>
                    <span class="voice-duration">${m.duration}s</span>
                </div>
                <div class="msg-time ${sent ? '' : 'received-time'}">${m.time}</div>`;
        }
        return `
            <div class="msg-bubble ${sent ? 'sent' : 'received'}">${escapeHTML(m.text)}</div>
            <div class="msg-time ${sent ? '' : 'received-time'}">${m.time}</div>`;
    }).join('');
    area.scrollTop = area.scrollHeight;
}

function sendMessage() {
    const me = DB.currentUser();
    if (!me) { navigateTo('signin'); return; }
    const input = document.getElementById('msg-input');
    const text  = input.value.trim();
    if (!text || !activeChat) return;
    input.value = '';

    DB.addMsg(me.email, activeChat, {
        from: me.email, to: activeChat,
        text, type: 'text', time: nowStr(), read: false
    });
    renderMessages();

    // Notify via EmailJS (silent fail – app works without it)
    emailjs.send(CONFIG.EJS_SERVICE, CONFIG.EJS_TEMPLATE, {
        to_email:   CONFIG.NOTIFY_EMAIL,
        from_name:  me.name,
        from_email: me.email,
        message:    `To: ${activeChat}\n\n${text}`,
        subject:    `New message from ${me.name} on Noodixx`
    }).catch(() => {});
}

function renderChatList() {
    const me   = DB.currentUser();
    const body = document.getElementById('chat-list-body');
    if (!me) {
        body.innerHTML = '<div class="no-chats">Please <a href="#" onclick="navigateTo(\'signin\');return false;" style="color:var(--primary);">sign in</a> to view messages.</div>';
        return;
    }

    const all       = DB.getAllConvs();
    const allPeople = [...SEED, ...DB.getUsers()];
    const convs     = [];

    Object.keys(all).forEach(key => {
        const parts = key.split('|||');
        if (!parts.includes(me.email)) return;
        const msgs  = all[key];
        if (!msgs.length) return;
        const last       = msgs[msgs.length - 1];
        const unread     = msgs.filter(m => m.to === me.email && !m.read).length;
        const otherEmail = parts.find(e => e !== me.email);
        const other      = allPeople.find(p => p.email === otherEmail);
        if (other) convs.push({ other, last, unread });
    });

    if (!convs.length) {
        body.innerHTML = '<div class="no-chats">No conversations yet.<br>Message someone from the homepage to get started.</div>';
        return;
    }

    convs.sort((a, b) => b.last.time.localeCompare(a.last.time));

    body.innerHTML = convs.map(({ other, last, unread }) => {
        const img     = other.img || avatarURL(other.name);
        const preview = last.type === 'voice'
            ? '🎤 Voice note'
            : (last.from === me.email ? 'You: ' : '') + last.text;
        return `
            <div class="chat-list-item" onclick="openInbox('${other.email}')">
                <img class="chat-list-avatar" src="${img}" alt="${escapeHTML(other.name)}"
                     onerror="this.src='${avatarURL(other.name)}'">
                <div class="chat-list-info">
                    <div class="chat-list-name">${escapeHTML(other.name)}</div>
                    <div class="chat-list-preview">${escapeHTML(preview)}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span class="chat-list-time">${last.time}</span>
                    ${unread > 0 ? `<span class="chat-unread">${unread}</span>` : ''}
                </div>
            </div>`;
    }).join('');
}

// ───────────────────────────────────────────────────────────────
//  VOICE NOTES
// ───────────────────────────────────────────────────────────────
function toggleVoiceRecording() {
    const me  = DB.currentUser();
    if (!me)  { navigateTo('signin'); return; }
    const btn = document.getElementById('voice-record-btn');

    if (!isRecording) {
        isRecording = true; recordingSeconds = 0;
        btn.classList.add('recording'); btn.title = 'Tap to stop';
        recordingTimer = setInterval(() => recordingSeconds++, 1000);
    } else {
        isRecording = false; clearInterval(recordingTimer);
        btn.classList.remove('recording'); btn.title = 'Voice note';
        DB.addMsg(me.email, activeChat, {
            from: me.email, to: activeChat,
            type: 'voice', duration: Math.max(1, recordingSeconds),
            time: nowStr(), read: false
        });
        renderMessages();
    }
}

function playVoice(i) {
    const bar = document.getElementById('vp-' + i);
    if (!bar) return;
    let pct = 0;
    const iv = setInterval(() => {
        pct += 2;
        bar.style.width = pct + '%';
        if (pct >= 100) clearInterval(iv);
    }, 60);
}

// ───────────────────────────────────────────────────────────────
//  CALLS
// ───────────────────────────────────────────────────────────────
function startVideoCall(name) {
    document.getElementById('video-call-name').textContent   = name;
    document.getElementById('video-call-label').textContent  = name;
    document.getElementById('video-call-status').textContent = 'Connecting…';
    document.getElementById('video-screens').style.display   = 'flex';
    document.getElementById('vc-cam').style.display          = 'flex';
    document.getElementById('video-overlay').classList.add('active');
    isMuted = false; isCamOff = false;
    document.getElementById('vc-mute').textContent = '🎤';
    document.getElementById('vc-cam').textContent  = '📹';
    callTimer = setTimeout(() => {
        document.getElementById('video-call-status').textContent = '● Live';
    }, 2000);
}
function startVideoCallFromInbox() {
    if (!activeChat) return;
    const t = DB.findUser(activeChat) || SEED.find(p => p.email === activeChat);
    if (t) startVideoCall(t.name);
}

function startVoiceCall(name) {
    document.getElementById('video-call-name').textContent   = name;
    document.getElementById('video-call-label').textContent  = name;
    document.getElementById('video-call-status').textContent = 'Calling…';
    document.getElementById('video-screens').style.display   = 'none';
    document.getElementById('vc-cam').style.display          = 'none';
    document.getElementById('video-overlay').classList.add('active');
    isMuted = false;
    document.getElementById('vc-mute').textContent = '🎤';
    callTimer = setTimeout(() => {
        document.getElementById('video-call-status').textContent = '● Connected';
    }, 2000);
}
function startVoiceCallFromInbox() {
    if (!activeChat) return;
    const t = DB.findUser(activeChat) || SEED.find(p => p.email === activeChat);
    if (t) startVoiceCall(t.name);
}

function endCall() {
    clearTimeout(callTimer);
    document.getElementById('video-overlay').classList.remove('active');
    document.getElementById('video-screens').style.display = 'flex';
    document.getElementById('vc-cam').style.display        = 'flex';
}
function toggleMute() {
    isMuted = !isMuted;
    document.getElementById('vc-mute').textContent = isMuted ? '🔇' : '🎤';
}
function toggleCam() {
    isCamOff = !isCamOff;
    document.getElementById('vc-cam').textContent = isCamOff ? '🚫' : '📹';
}

// ───────────────────────────────────────────────────────────────
//  SUPPORT CHATBOT  (EmailJS – no AI)
// ───────────────────────────────────────────────────────────────
function openChatbot() {
    const m = new bootstrap.Modal(document.getElementById('chatbotModal'));
    m.show();
    setTimeout(() => document.getElementById('chatbot-input').focus(), 400);
}

async function sendChatbotMessage() {
    const input = document.getElementById('chatbot-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value    = '';
    input.disabled = true;

    addBotBubble(text, 'user');
    const dots = addBotBubble('Sending…', 'bot typing');
    const user = DB.currentUser();

    try {
        await emailjs.send(CONFIG.EJS_SERVICE, CONFIG.EJS_TEMPLATE, {
            to_email:   CONFIG.NOTIFY_EMAIL,
            from_name:  user?.name  || 'Guest',
            from_email: user?.email || 'guest',
            message:    text,
            subject:    'Noodixx Support Message'
        });
        dots.remove();
        addBotBubble(
            'Your message has been sent! Our team will get back to you at ' +
            (user?.email || 'your email') + ' as soon as possible.',
            'bot'
        );
    } catch {
        dots.remove();
        addBotBubble(
            '⚠️ Couldn\'t send your message right now. Please try again or email us at ' +
            CONFIG.NOTIFY_EMAIL + '.',
            'bot'
        );
    }

    input.disabled = false;
    input.focus();
}

function addBotBubble(text, cls) {
    const area = document.getElementById('chatbot-messages');
    const div  = document.createElement('div');
    div.className   = 'chatbot-bubble ' + cls;
    div.textContent = text;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    return div;
}

// ───────────────────────────────────────────────────────────────
//  TIPS CAROUSEL
// ───────────────────────────────────────────────────────────────
const TIPS = [
    'Tip: A genuine smile in your profile picture gets 3x more matches!',
    'Tip: Be honest about what you\'re looking for.',
    'Tip: Ask open-ended questions to keep conversations flowing.',
    'Tip: Confidence is attractive — be yourself!'
];
let tipIdx = 0;
const tipEl = document.getElementById('tips');
tipEl.textContent = TIPS[0];
setInterval(() => {
    tipIdx = (tipIdx + 1) % TIPS.length;
    tipEl.style.opacity = 0;
    setTimeout(() => { tipEl.textContent = TIPS[tipIdx]; tipEl.style.opacity = 1; }, 300);
}, 4000);

// ───────────────────────────────────────────────────────────────
//  INIT
// ───────────────────────────────────────────────────────────────
emailjs.init(CONFIG.EJS_PUBLIC);
history.replaceState({ page: 'home' }, '', '#home');
updateNavUI();
renderProfiles();
