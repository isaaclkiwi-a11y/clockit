(() => {
  const base = (window.CLOCKIT_CHAT_URL || '').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const loginPanel = $('loginPanel'), chatPanel = $('chatPanel');
  let token = null, socket = null, username = null, profile = { displayName: '', avatar: '🌿' }, selectedAvatar = '🌿';
  let messageCache = [];
  const avatars = ['🌿','🐸','🐻','🐱','🐼','🦊','🐰','🐧','⭐','🌙','💚','💜'];
  function status(el, message) { $(el).textContent = message || ''; }
  function showLogin(message='') {
    if(socket){socket.disconnect();socket=null;}
    token=null;username=null;profile={displayName:'',avatar:'🌿'};messageCache=[];
    loginPanel.hidden=false;chatPanel.hidden=true;status('loginStatus',message);
    $('password').value='';
  }
  function showChat() { loginPanel.hidden=true;chatPanel.hidden=false; }
  function safeText(s) { return String(s ?? ''); }
  function displayLabel(m) { return safeText(m.displayName || m.username || 'Someone'); }
  function renderMessages() {
    const box=$('messages'); box.replaceChildren();
    for (const m of messageCache) {
      const item=document.createElement('div'); item.className='message'+(m.username===username?' mine':'');
      const avatar=document.createElement('div'); avatar.className='message-avatar'; avatar.textContent=avatars.includes(m.avatar)?m.avatar:'🌿';
      const content=document.createElement('div'); content.className='message-content';
      const meta=document.createElement('span');meta.className='meta';
      const date = m.createdAt ? new Date(m.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      meta.textContent=`${displayLabel(m)} · ${date}`;
      const body=document.createElement('div');body.className='message-body';body.textContent=safeText(m.body);
      content.append(meta,body);item.append(avatar,content);box.appendChild(item);
    }
    box.scrollTop=box.scrollHeight;
  }
  async function api(path, options={}) {
    if(!base || base.includes('REPLACE-WITH-YOUR-CHAT-HOSTNAME')) throw new Error('Chat server URL is not configured yet.');
    const headers={'Content-Type':'application/json',...(options.headers||{})};if(token)headers.Authorization='Bearer '+token;
    const r=await fetch(base+path,{...options,headers});let data={};try{data=await r.json()}catch{}
    if(!r.ok)throw new Error(data.error||`Request failed (${r.status})`);return data;
  }
  function setAvatarChoices(avatar) {
    selectedAvatar = avatars.includes(avatar) ? avatar : '🌿';
    document.querySelectorAll('.avatar-choice').forEach(btn=>{
      const active=btn.dataset.avatar===selectedAvatar;
      btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));
    });
  }
  function fillProfileSettings() {
    $('displayName').value=profile.displayName || username || '';
    setAvatarChoices(profile.avatar);
    $('myAvatar').textContent=profile.avatar || '🌿';
    $('chatGreeting').textContent=profile.displayName || username || 'ClockIT Chat';
  }
  async function loadMessages() {
    const data=await api('/api/messages');messageCache=data.messages || [];renderMessages();
  }
  async function loadProfile() {
    const data=await api('/api/profile');profile={displayName:data.profile.displayName || '',avatar:data.profile.avatar || '🌿'};fillProfileSettings();
  }
  async function connectChat() {
    showChat();$('messages').replaceChildren();status('connectionStatus','Loading your chat…');
    try { await loadProfile(); await loadMessages(); }
    catch(e){status('chatStatus',e.message);}
    if(typeof io!=='function'){status('connectionStatus','Chat library could not load');return;}
    socket=io(base,{transports:['websocket','polling'],auth:{token}});
    socket.on('connect',()=>status('connectionStatus','Connected'));
    socket.on('disconnect',()=>status('connectionStatus','Disconnected'));
    socket.on('connect_error',e=>status('connectionStatus','Could not connect: '+(e.message||'check server')));
    socket.on('chat:message',m=>{messageCache.push(m);messageCache=messageCache.slice(-300);renderMessages();});
    socket.on('profile:updated',async()=>{try{await loadMessages();}catch{}});
    socket.on('chat:error',m=>status('chatStatus',m.error||'Chat error'));
  }
  $('loginButton').addEventListener('click',async()=>{
    const u=$('username').value.trim(),p=$('password').value;
    if(!u||!p){status('loginStatus','Enter your username and password.');return;}
    $('loginButton').disabled=true;status('loginStatus','Signing in…');
    try{const data=await api('/api/login',{method:'POST',body:JSON.stringify({username:u,password:p})});token=data.token;username=data.username;await connectChat();}
    catch(e){status('loginStatus',e.message);}finally{$('loginButton').disabled=false;}
  });
  $('password').addEventListener('keydown',e=>{if(e.key==='Enter')$('loginButton').click();});
  $('logoutButton').addEventListener('click',()=>showLogin('You have logged out.'));
  $('settingsToggle').addEventListener('click',()=>{
    const panel=$('settingsPanel'),open=panel.hidden;
    panel.hidden=!open;$('settingsToggle').setAttribute('aria-expanded',String(open));
    if(open){fillProfileSettings();$('displayName').focus();}
  });
  $('cancelSettings').addEventListener('click',()=>{
    $('settingsPanel').hidden=true;$('settingsToggle').setAttribute('aria-expanded','false');status('profileStatus','');fillProfileSettings();
  });
  document.querySelectorAll('.avatar-choice').forEach(btn=>btn.addEventListener('click',()=>setAvatarChoices(btn.dataset.avatar)));
  $('saveProfile').addEventListener('click',async()=>{
    const displayName=$('displayName').value.trim();
    if(!displayName){status('profileStatus','Choose a display name first.');return;}
    $('saveProfile').disabled=true;status('profileStatus','Saving…');
    try{
      const data=await api('/api/profile',{method:'PUT',body:JSON.stringify({displayName,avatar:selectedAvatar})});
      profile=data.profile;fillProfileSettings();status('profileStatus','Profile saved!');
      $('settingsPanel').hidden=true;$('settingsToggle').setAttribute('aria-expanded','false');
      try{await loadMessages();}catch{}
    }catch(e){status('profileStatus',e.message);}finally{$('saveProfile').disabled=false;}
  });
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const body=$('messageInput').value.trim();if(!body||!token)return;
    $('messageInput').disabled=true;
    try{await api('/api/messages',{method:'POST',body:JSON.stringify({body})});$('messageInput').value='';status('chatStatus','');}
    catch(err){status('chatStatus',err.message);}
    finally{$('messageInput').disabled=false;$('messageInput').focus();}
  });
})();
