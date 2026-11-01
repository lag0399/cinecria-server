// Modo navegador: o socket.io client vem do próprio servidor de sinalização.
if (!window.io && location.protocol.startsWith('http')) {
  const s = document.createElement('script');
  s.src = '/socket.io/socket.io.js';
  document.head.appendChild(s);
}
