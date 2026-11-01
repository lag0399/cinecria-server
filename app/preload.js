/**
 * Ponte segura entre o renderer e o processo principal.
 * O renderer não tem acesso ao Node — só a estas funções.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cinecria', {
  isElectron: true,
  platform: process.platform,
  /** Lista telas e janelas disponíveis (com miniaturas) para o seletor do Cinecria. */
  getSources: () => ipcRenderer.invoke('screen:get-sources'),
  /** Define a fonte que o próximo getDisplayMedia() vai capturar. */
  selectSource: (sel) => ipcRenderer.invoke('screen:select', sel),
});
