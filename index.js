const config = require("../config/config");
const { ipcRenderer } = require("electron");

class Plugin {
  static instance = null;

  #ctx;
  #config;
  #exptech_config;
  #server;

  constructor(ctx) {
    if (Plugin.instance) return Plugin.instance;

    this.#ctx = ctx;
    this.#config = null;
    this.config = {};
    this.#exptech_config = null;
    this.exptech_config = {};
    this.logger = null;
    this.#server = null;

    Plugin.instance = this;
  }

  static getInstance() {
    if (!Plugin.instance) throw new Error("Plugin not initialized");

    return Plugin.instance;
  }

  onLoad() {
    const { TREM, Logger, info, utils, MixinManager } = this.#ctx;

    const { CustomLogger } =
      require("./src/utils/logger").createCustomLogger(Logger);
    this.logger = new CustomLogger("websocket");

    const defaultDir = utils.path.join(info.pluginDir, "./websocket/resource/default.yml");
    const configDir = utils.path.join(info.pluginDir, "./websocket/config.yml");

    this.#config = new config("websocket", this.logger, utils.fs, defaultDir, configDir);
    this.config = this.#config.getConfig();

    const exptech_defaultDir = utils.path.join(info.pluginDir, "./exptech/resource/default.yml");
    const exptech_configDir = utils.path.join(info.pluginDir, "./exptech/config.yml");

    this.#exptech_config = new config("exptech_websocket", this.logger, utils.fs, exptech_defaultDir, exptech_configDir);
    this.exptech_config = this.#exptech_config.getConfig();

    const server = require("./src/server");
    this.#server = new server(this.logger, this.config.server, this.config, this.#exptech_config, TREM, ipcRenderer);

    this.init(TREM);
    this.addClickEvent(TREM);
  }

  getWsVerifyList() {
    if (!this.#server) {
      throw new Error("Server not initialized");
    }
    return this.#server.get_ws_verify_list();
  }

  init(TREM) {
    const focusButton = document.querySelector("#focus");
    if (focusButton) {
      const button = document.createElement("div");
      button.id = "websocket";
      button.className = "nav-bar-location";
      button.title = `${TREM.variable.play_mode === 0 ? "HTTP 切換到 WebSocket" : TREM.variable.play_mode === 1 ? "WebSocket 切換到 HTTP" : "不明"}`;
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M483-337q-29 0-56.5-10T378-378q-20-20-31-46.28T336-480q0-9.74.8-18.99.8-9.25 3.2-18.01 2-10-1.66-18.82-3.65-8.83-12.59-12.5-9.75-3.68-18.37.51-8.63 4.19-11.63 14.24Q292-521 290-507.63q-2 13.37-2 27.63 0 38 14.71 73.42Q317.42-371.17 344-344q28 28 64.5 42t75.5 14l-27 27q-7 7.36-7 17.18t7 16.82q7 7 16.82 7t17.18-7l59.79-59.79Q562-298 562-312.18T551-337l-59-60q-7.36-7-17.18-7T458-397q-7 7-7 16.82t7 17.18l25 26Zm-7-287q29.7 0 57.35 10.5Q561-603 582-582q20 20 31 46.28T624-480q0 9-.8 18.5T620-443q-2 10 1.5 19t12.59 12q9.91 3 18.89-1.32 8.99-4.33 12.11-14.71Q669-441 670.5-453.5 672-466 672-480q0-38-15-73.5T615-616q-28-28-65-41.5T474-670l29-29q7-7.36 7-17.18T503-733q-7-7-16.82-7T469-733l-59.79 59.79Q398-662 398-647.82T409-623l60 60q7.36 7 17.18 7t16.82-7q7-7 7-16.82T503-597l-27-27Zm4.28 528Q401-96 331-126t-122.5-82.5Q156-261 126-330.96t-30-149.5Q96-560 126-629.5q30-69.5 82.5-122T330.96-834q69.96-30 149.5-30t149.04 30q69.5 30 122 82.5T834-629.28q30 69.73 30 149Q864-401 834-331t-82.5 122.5Q699-156 629.28-126q-69.73 30-149 30Zm-.28-72q130 0 221-91t91-221q0-130-91-221t-221-91q-130 0-221 91t-91 221q0 130 91 221t221 91Zm0-312Z"/></svg>`;
      focusButton.insertAdjacentElement("afterend", button);
    }
  }

  addClickEvent(TREM) {
    const button = document.querySelector("#websocket");
    button.addEventListener("click", () => {
      if (TREM.variable.play_mode === 1) {
        button.title = "HTTP 切換到 WebSocket";
        TREM.variable.play_mode = 0;
        this.#server.set_ws_open(false);
        // logger.info("HTTP");
      } else if (TREM.variable.play_mode === 0) {
        button.title = "WebSocket 切換到 HTTP";
        TREM.variable.play_mode = 1;
        this.#server.set_ws_open(true);
        // logger.info("WebSocket");
      }
    });
  }
}

module.exports = Plugin;
