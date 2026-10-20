(() => {
  const base = (window.CLOCKIT_CHAT_URL || '').replace(/\/$/, '');
  const $ = id => document.getElementById(id);
  const loginPanel = $('loginPanel'), chatPanel = $('chatPanel');
  let token = null, socket = null, username = null;
  function status(el, message) { $(el).textContent = message || ''; }
  function showLogin(message='') { if(socket){socket.disconnect();socket=null;} token=null;username=null;loginPanel.hidden=false;chatPanel.hidden=true;status('loginStatus',message); }
  function showChat() { loginPanel.hidden=true;chatPanel.hidden=false; }
  function safeText(s) { return String(s ?? ''); }
  function addMessage(m) {
    const box=$('messages'), item=document.createElement('div'); item.className='message'+(m.username===username?' mine':'');
    const meta=document.createElement('span');meta.className='meta';meta.textContent=`${safeText(m.username)} · ${new Date(m.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
    const body=document.createElement('div');body.textContent=safeText(m.body);item.append(meta,body);box.appendChild(item);box.scrollTop=box.scrollHeight;
  }
  async function api(path, options={}) {
    if(!base || base.includes('REPLACE-WITH-YOUR-CHAT-HOSTNAME')) throw new Error('Chat server URL is not configured yet.');
    const headers={'Content-Type':'application/json',...(options.headers||{})};if(token)headers.Authorization='Bearer '+token;
    const r=await fetch(base+path,{...options,headers});let data={};try{data=await r.json()}catch{}
    if(!r.ok)throw new Error(data.error||`Request failed (${r.status})`);return data;
  }
  async function connectChat() {
    showChat();$('messages').replaceChildren();status('connectionStatus','Loading messages…');
    try { const data=await api('/api/messages');data.messages.forEach(addMessage); }
    catch(e){status('chatStatus',e.message);}
    if(typeof io!=='function'){status('connectionStatus','Chat library could not load');return;}
    socket=io(base,{transports:['websocket','polling'],auth:{token}});
    socket.on('connect',()=>status('connectionStatus','Connected'));socket.on('disconnect',()=>status('connectionStatus','Disconnected'));socket.on('connect_error',e=>status('connectionStatus','Could not connect: '+(e.message||'check server')));
    socket.on('chat:message',m=>addMessage(m));socket.on('chat:error',m=>status('chatStatus',m.error||'Chat error'));
  }
  $('loginButton').addEventListener('click',async()=>{
    const u=$('username').value.trim(),p=$('password').value;
    if(!u||!p){status('loginStatus','Enter your username and password.');return;}
    $('loginButton').disabled=true;status('loginStatus','Signing in…');
    try{const data=await api('/api/login',{method:'POST',body:JSON.stringify({username:u,password:p})});token=data.token;username=data.username;$('password').value='';await connectChat();}
    catch(e){status('loginStatus',e.message);}finally{$('loginButton').disabled=false;}
  });
  $('logoutButton').addEventListener('click',()=>showLogin('You have logged out.'));
  $('messageForm').addEventListener('submit',async e=>{e.preventDefault();const body=$('messageInput').value.trim();if(!body||!token)return;$('messageInput').disabled=true;try{await api('/api/messages',{method:'POST',body:JSON.stringify({body})});$('messageInput').value='';status('chatStatus','');}catch(err){status('chatStatus',err.message);}finally{$('messageInput').disabled=false;$('messageInput').focus();}});
})();
