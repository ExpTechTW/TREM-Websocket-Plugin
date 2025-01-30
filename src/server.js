const WebSocket = require("../node_modules/ws/index");

class Server {
  static instance;
  ws_verify_list = [];

  constructor(logger, urls, config, exptech_config, TREM, MixinManager) {
    if (Server.instance)
      return Server.instance;

    this.logger = logger;
    this.urls = urls;
    this.ws = null;
    this.reconnect = true;
    this.info_get = false;
    this.ws_gg = false;

    this.config = config;
    this.exptech_config = exptech_config;
    this.get_exptech_config = this.exptech_config.getConfig();
    this.TREM = TREM;

    const rts = null, eew = null, intensity = null, lpgm = null, tsunami = null, report = null, rtw = null;
    this.data = { rts, eew, intensity, lpgm, tsunami, report, rtw };

    this.wsConfig = {
      type    : "start",
      service : this.config.service,
      key     : this.get_exptech_config.user.token ?? "",
    };

    this.ws_verify_list = Server.ws_verify_list;
    this.ws_time = 0;

    this.connect();

    this.connect_clock = setInterval(() => this.runCheckconnect(), 3000);

    Server.instance = this;
  }

  runCheckconnect() {
    if (this.ws_gg)
      this.connect();
    else if ((Date.now() - this.ws_time > 30_000 && this.ws_time != 0))
      this.connect();
  }

  get_ws_verify_list() {
    return this.ws_verify_list;
  }

  set_ws_open(ws_open) {
    if (!ws_open) {
      if (this.reconnect) this.reconnect = false;
      if (this.connect_clock) {
        clearInterval(this.connect_clock);
        this.connect_clock = null;
      }
      this.ws_time = 0;
      this.ws.close();
      this.ws_gg = false;
      this.ws = null;
      this.logger.info("WebSocket close -> chenges");
    } else {
      if (!this.reconnect) this.reconnect = true;
      if (this.info_get) this.info_get = false;
      if (!this.connect_clock) {
        this.connect_clock = setInterval(() => this.runCheckconnect(), 3000);
      }
      this.get_exptech_config = this.exptech_config.getConfig();
      this.wsConfig = {
        type    : "start",
        service : this.config.service,
        key     : this.get_exptech_config.user.token ?? "",
      };
      this.connect();
      this.logger.info("WebSocket open -> chenges");
    }
  }

  connect() {
    if (!this.reconnect) return;
    if (this.ws) this.ws.terminate();
    this.ws = null;
    const url = `wss://${this.urls[Math.floor(Math.random() * this.urls.length)]}/websocket`;
    this.ws = new WebSocket(url);
    this.logger.info("websocket connecting to -> ", url);
    this.ws_event();
  }

  ws_event() {
    this.ws.onclose = () => {
      this.ws_gg = true;
      this.logger.warn(this.connect_clock);
      this.logger.warn("WebSocket close");
    };

    this.ws.onerror = (error) => {
      this.ws_gg = true;
      this.logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      this.ws_gg = false;
      this.logger.info("WebSocket open");

      this.send(this.wsConfig);
    };

    this.ws.onmessage = (evt) => {
      const json = JSON.parse(evt.data);

      switch (json.type) {
        case "verify":{
          this.send(this.wsConfig);
          break;
        }
        case "info":{
          if (json.data.code == 401) {
            this.reconnect = false;
            this.logger.info("WebSocket close -> 401");
            this.ws.close();
            this.ws = null;
          } else if (json.data.code == 200) {
            this.ws_time = Date.now();
            if (!this.info_get) {
              this.info_get = true;
              this.logger.info("info:", json.data);
              this.ws_verify_list = json.data.list;
              if (json.data.list.includes("trem.eew")) {
                if (this.config.SHOW_BOTH_EEW) {
                  this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter((author) => author != 'cwa');
                  this.TREM.constant.EEW_AUTHOR.push("cwa");
                  this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter((author) => author != 'trem');
                  this.TREM.constant.EEW_AUTHOR.push("trem");
                  this.TREM.constant.SHOW_TREM_EEW = true;
                  localStorage.setItem(
                    "eew-source-plugin",
                    JSON.stringify(this.TREM.constant.EEW_AUTHOR),
                  );
                } else {
                  this.TREM.constant.SHOW_TREM_EEW = true;
                  const eewSource = JSON.parse(localStorage.getItem("eew-source-plugin")) || [];
                  if (eewSource.includes("trem")) this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter(author => author != "cwa");
                }
                this.logger.info("EEW_AUTHOR:", this.TREM.constant.EEW_AUTHOR);
              }
            }
            if (this.TREM.variable.play_mode != 2) {
              this.TREM.variable.play_mode = 1;
              const button = document.querySelector("#websocket");
              button.title = "WebSocket 切換到 HTTP";
            }
          } else if (json.data.code == 400) {
            this.send(this.wsConfig);
          }
          break;
        }
        case "data":{
          switch (json.data.type) {
            case "rts":
              this.ws_time = Date.now();
              this.data.rts = json.data.data;
              if (this.TREM.variable.play_mode == 1) {
                this.TREM.variable.data.rts = this.data.rts;
                this.TREM.variable.events.emit("DataRts", {
                  info : { type: this.TREM.variable.play_mode },
                  data : this.data.rts,
                });
                this.TREM.variable.cache.last_data_time = Date.now();
                if (this.data.rts.int.length == 0) {
                  this.processEEWData();
                }
              }
              break;
            case "tsunami":
              this.logger.info("data tsunami:", json.data);
							this.data.tsunami = json.data;
							break;
						case "eew":
              this.logger.info("data eew:", json.data);
              this.data.eew = json.data;
              if (this.TREM.variable.play_mode == 1) this.processEEWData(this.data.eew);
              break;
            case "intensity":
              this.logger.info("data intensity:", json.data);
              this.data.intensity = json.data;
              if (this.TREM.variable.play_mode === 1) this.processIntensityData(this.data.intensity);
							break;
						case "report":
              this.logger.info("data report:", json.data);
							this.data.report = json.data.data;
              if (this.TREM.variable.play_mode === 1) {
                const url = this.TREM.constant.URL.API[Math.floor(Math.random() * this.TREM.constant.URL.API.length)];
                const data = json.data.data;
                if (data) {
                  this.TREM.variable.events.emit('ReportRelease', { info: { url }, data });
                }
              }
							break;
						case "rtw":
							this.data.rtw = json.data;
							break;
            case "lpgm":
              this.logger.info("data lpgm:", json.data);
              this.data.lpgm = json.data;
              break;
            default:
              this.logger.info("data:", json.data);
          }
          break;
        }
        case "ntp":{
          this.ws_time = Date.now();
          break;
        }
        default:{
          this.logger.info("json:", json);
        }
      }
    };
  }

  send(data) {
    if (this.ws) this.ws.send(JSON.stringify(data));
  }

  processEEWData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 240 * 1000;
    const STATUS_3_TIMEOUT = 30 * 1000;

    this.TREM.variable.data.eew
      .filter((item) =>
        item.eq?.time && (
          currentTime - item.eq.time > EXPIRY_TIME
          || item.EewEnd
          || (item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT)
        ),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit("EewEnd", {
          info : { type: this.TREM.variable.play_mode },
          data : { ...data, EewEnd: true },
        });
      });

    this.TREM.variable.data.eew = this.TREM.variable.data.eew.filter((item) =>
      item.eq?.time
      && currentTime - item.eq.time <= EXPIRY_TIME
      && !item.EewEnd
      && !(item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT),
    );

    if (!data.eq?.time || currentTime - data.eq.time > EXPIRY_TIME || data.EewEnd)
      return;


    const existingIndex = this.TREM.variable.data.eew.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1)
      if (!this.TREM.variable.cache.eew_last[data.id]) {
        if (this.TREM.constant.EEW_AUTHOR.includes(data.author)) {
          this.TREM.variable.cache.eew_last[data.id] = {
            last_time : currentTime,
            serial    : 1,
          };
          this.TREM.variable.data.eew.push(data);
          this.TREM.variable.events.emit("EewRelease", eventData);
        }
        return;
      }


    if (this.TREM.variable.cache.eew_last[data.id] && this.TREM.variable.cache.eew_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.eew_last[data.id].serial = data.serial;

      if (data.status === 3)
        data.status3Time = currentTime;


      this.TREM.variable.events.emit("EewUpdate", eventData);

      if (!this.TREM.variable.data.eew[existingIndex].status && data.status == 1)
        this.TREM.variable.events.emit("EewAlert", eventData);


      this.TREM.variable.data.eew[existingIndex] = data;
    }

    this.cleanupCache("eew_last");

    this.TREM.variable.events.emit("DataEew", {
      info : { type: this.TREM.variable.play_mode },
      data : this.TREM.variable.data.eew,
    });
  }

  cleanupCache(cacheKey) {
    const currentTime = this.now();
    Object.keys(this.TREM.variable.cache[cacheKey]).forEach((id) => {
      const item = this.TREM.variable.cache[cacheKey][id];
      if (currentTime - item.last_time > 600000)
        delete this.TREM.variable.cache[cacheKey][id];

    });
  }

  now() {
    if (this.TREM.variable.play_mode == 2 || this.TREM.variable.play_mode == 3) {
      if (!this.TREM.variable.replay.local_time)
        this.TREM.variable.replay.local_time = Date.now();

      return this.TREM.variable.replay.start_time + (Date.now() - this.TREM.variable.replay.local_time);
    }

    if (!this.TREM.variable.cache.time.syncedTime || !this.TREM.variable.cache.time.lastSync)
      return Date.now();

    const offset = Date.now() - this.TREM.variable.cache.time.lastSync;
    return this.TREM.variable.cache.time.syncedTime + offset;
  }
}

module.exports = Server;