const WebSocket = require("../node_modules/ws/index");

class Server {
  static instance;
  ws_verify_list = [];
  reconnectDelay = 1000;  // 初始重連延遲
  maxReconnectDelay = 30000;  // 最大延遲 30 秒
  lastDataTime = 0;  // 新增最後資料接收時間追蹤

  constructor(logger, urls, config, exptech_config, TREM, ipcRenderer) {
    if (Server.instance)
      return Server.instance;

    this.logger = logger;
    this.urls = urls;
    this.ws = null;
    // this.reconnect = true;
    this.info_get = false;
    this.ws_gg = false;
    this.isConnecting = false;

    // this.ws_start_time = 0;
    this.ws_off_num = 0;

    this.config = config;
    this.exptech_config = exptech_config;
    this.get_exptech_config = this.exptech_config.getConfig();
    this.TREM = TREM;
    // this.ipcRenderer = ipcRenderer;

    // this.ipcRenderer.on("update-rtw-station", (event, ans) => {
    //   const keys = ans.keys - 1;
    //   this.logger.info("Received keys:", keys);
    //   this.logger.info("Received ans keys:", ans.keys);
    //   this.logger.info("Received name:", ans.name);
    // });

    // 檢查並可能移除 trem.rtw 服務
    if (this.config.service.includes('trem.rtw') && localStorage.getItem('rtw-main-switch') !== 'true') {
      this.config.service = this.config.service.filter(service => service !== 'trem.rtw');
    }

    const rts = null, eew = null, intensity = null, lpgm = null, tsunami = null, report = null, rtw = null;
    this.data = { rts, eew, intensity, lpgm, tsunami, report, rtw };

    this.configRTW = [
      { keys: "1", value: "11339620", text: "即時測站波形圖1" },
      { keys: "2", value: "11336952", text: "即時測站波形圖2" },
      { keys: "3", value: "11334880", text: "即時測站波形圖3" },
      { keys: "4", value: "11370676", text: "即時測站波形圖4" },
      { keys: "5", value: "6126556", text: "即時測站波形圖5" },
      { keys: "6", value: "6732340", text: "即時測站波形圖6" },
    ];

    this.wsConfig = {
        type    : "start",
        // service : this.config.service,
        // ...(localStorage.getItem('rtw-main-switch') === 'true' && {
        //   config: {
        //     "trem.rtw": this.configRTW.map(source =>
        //       localStorage.getItem(`rtw-station-${source.keys}`)
        //         ? parseInt(localStorage.getItem(`rtw-station-${source.keys}`))
        //         : parseInt(source.value)
        //     )
        //   }
        // }),
        token : this.get_exptech_config.user.token ?? "",
        topic: this.config.service,
        time: Date.now(),
      };
    // this.logger.info("wsConfig", this.wsConfig);

    this.ws_verify_list = Server.ws_verify_list;

    this.connect();

    this.connect_clock = setInterval(() => this.runCheckconnect(), 3000);

    Server.instance = this;
  }

  runCheckconnect() {
    if (this.isConnecting) return;
    if (this.lastDataTime !== 0 && Date.now() > this.lastDataTime + 3_000) {
      this.logger.warn("ws time out 3 sec");
      this.ws_off_fun();
    }
    if (this.ws_gg) {
      this.reconnectDelay = Math.min(this.reconnectDelay * 3, this.maxReconnectDelay);
      setTimeout(() => this.connect(), this.reconnectDelay);  // 動態延遲
    } else if ((Date.now() - this.lastDataTime > 30_000 && this.lastDataTime !== 0)) {
      this.reconnectDelay = Math.min(this.reconnectDelay * 3, this.maxReconnectDelay);
      setTimeout(() => this.connect(), this.reconnectDelay);  // 動態延遲
    }
  }

  get_ws_verify_list() {
    return this.ws_verify_list;
  }

  set_ws_open(ws_open) {
    if (this.ws_off_num >= 5)
      this.ws_off_num = 0;  // 重置斷線計數
    if (!ws_open) {
      // if (this.reconnect) this.reconnect = false;
      if (this.connect_clock) {
        clearInterval(this.connect_clock);
        this.connect_clock = null;
      }
      this.ws.close();
      this.ws_gg = false;
      this.ws = null;
      this.logger.info("WebSocket close -> chenges");
    } else {
      // if (!this.reconnect) this.reconnect = true;
      if (this.info_get) this.info_get = false;
      if (!this.connect_clock) {
        this.connect_clock = setInterval(() => this.runCheckconnect(), 3000);
      }
      this.get_exptech_config = this.exptech_config.getConfig();
      // 檢查並可能移除 trem.rtw 服務
      if (this.config.service.includes('trem.rtw') && localStorage.getItem('rtw-main-switch') !== 'true') {
        this.config.service = this.config.service.filter(service => service !== 'trem.rtw');
      }
      this.wsConfig = {
        type    : "start",
        // service : this.config.service,
        // ...(localStorage.getItem('rtw-main-switch') === 'true' && {
        //   config: {
        //     "trem.rtw": this.configRTW.map(source =>
        //       localStorage.getItem(`rtw-station-${source.keys}`)
        //         ? parseInt(localStorage.getItem(`rtw-station-${source.keys}`))
        //         : parseInt(source.value)
        //     )
        //   }
        // }),
        token : this.get_exptech_config.user.token ?? "",
        topic: this.config.service,
        time: Date.now(),
      };
      // this.logger.info("wsConfig", this.wsConfig);
      if (this.isConnecting) this.isConnecting = false;
      this.connect();
      this.logger.info("WebSocket open -> chenges");
    }
  }

  connect() {
    // if (!this.reconnect || this.isConnecting) return;
    if (this.isConnecting) return;

    if (this.ws) {
      if (this.ws.readyState === WebSocket.CONNECTING) {
        return;  // 避免終止正在連接中的 WebSocket
      }
      this.ws.terminate();
    }
    this.isConnecting = true;  // 標記連線中狀態
    this.ws = null;
    const url = `wss://${this.urls[Math.floor(Math.random() * this.urls.length)]}/ws`;
    this.ws = new WebSocket(url);
    this.logger.info("websocket connecting to -> ", url);
    this.ws_event();
  }

  ws_off_fun() {
    if (this.config.WS_OFF_PASS) {
      this.reconnectDelay = 1000;  // 重置延遲計數
      return;
    }
    this.ws_off_num += 1;
    this.logger.warn(`WebSocket connection warning: Disconnected ${this.ws_off_num} times`);
    if (this.ws_off_num >= 5) {
      this.reconnectDelay = 1000;  // 重置延遲計數
      this.logger.error(`WebSocket connection error: Disconnected ${this.ws_off_num} times, stopping reconnection`);
      // if (this.reconnect) this.reconnect = false;
      if (this.connect_clock) {
        clearInterval(this.connect_clock);
        this.connect_clock = null;
      }
      if (this.ws) {
        if (this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
        this.ws.terminate();
      }
      this.ws_gg = false;
      this.ws = null;
      this.logger.info("WebSocket close -> connection error");
      this.TREM.variable.play_mode = 0;
      const button = document.querySelector("#websocket");
      button.title = "HTTP 切換到 WebSocket";
    }
  }

  ws_gg_fun() {
    this.ws_gg = true;
    this.ws_off_fun();
  }

  ws_event() {
    this.ws.onclose = (event) => {
      this.isConnecting = false;
      // 1000: 正常關閉
      // 1001: 終端離開，如關閉視窗、導航離開
      // 1006: 異常關閉，如伺服器掛掉或網路問題
      if (event.code === 1000 || event.code === 1001) {
        this.logger.warn("WebSocket closed by client");
      } else {
        this.ws_gg_fun();
        this.logger.warn("WebSocket connection lost:", event.code);
      }
      this.logger.warn("timer id:", this.connect_clock);
      this.logger.warn("WebSocket close");
    };

    this.ws.onerror = (error) => {
      this.isConnecting = false;
      this.ws_gg_fun();
      this.logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.ws_gg = false;
      this.logger.info("WebSocket open");

      this.send(this.wsConfig);
    };

    this.ws.onmessage = (evt) => {
      this.lastDataTime = Date.now();
      const json = JSON.parse(evt.data);

      switch (json.type) {
        case "verify":{
          this.logger.info("WebSocket -> verify");
          this.send(this.wsConfig);
          break;
        }
        case "info":{
          if (json.event != 'connect') {
            // this.reconnect = false;
            this.logger.info("WebSocket close -> 401");
            this.ws.close();
            this.ws = null;
          } else {
            if (!this.info_get) {
              this.info_get = true;
              this.logger.info("info:", json);
              this.ws_verify_list = json.topic.success;
              // if (json.data.list.includes("trem.eew")) {
              //   if (this.config.SHOW_BOTH_EEW) {
              //     this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter((author) => author != 'cwa');
              //     this.TREM.constant.EEW_AUTHOR.push("cwa");
              //     this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter((author) => author != 'trem');
              //     this.TREM.constant.EEW_AUTHOR.push("trem");
              //     this.TREM.constant.SHOW_TREM_EEW = true;
              //     localStorage.setItem(
              //       "eew-source-plugin",
              //       JSON.stringify(this.TREM.constant.EEW_AUTHOR),
              //     );
              //   } else {
              //     this.TREM.constant.SHOW_TREM_EEW = true;
              //     const eewSource = JSON.parse(localStorage.getItem("eew-source-plugin")) || [];
              //     if (eewSource.includes("trem")) this.TREM.constant.EEW_AUTHOR = this.TREM.constant.EEW_AUTHOR.filter(author => author != "cwa");
              //   }
              //   this.logger.info("EEW_AUTHOR:", this.TREM.constant.EEW_AUTHOR);
              // }
            }
            if (this.TREM.variable.play_mode != 2) {
              this.TREM.variable.play_mode = 1;
              const button = document.querySelector("#websocket");
              button.title = "WebSocket 切換到 HTTP";
            }
          }
          break;
        }
        case "data":{
          // this.logger.info("data:", json);
          switch (json.payload.payload.type) {
            case "rts":
              this.data.rts = json.payload.payload.data;
              if (this.TREM.variable.play_mode == 1) {
                this.TREM.variable.data.rts = this.data.rts;
                this.TREM.variable.events.emit("DataRts", {
                  info : { type: this.TREM.variable.play_mode },
                  data : this.data.rts,
                });
                this.TREM.variable.cache.last_data_time = Date.now();
                if (this.data.rts.int.length == 0) {
                  this.processEEWData();
                  this.processIntensityData();
                }
              }
              break;
            case "tsunami":
              this.logger.info("data tsunami:", json.payload.payload.data);
							this.data.tsunami = json.payload.payload.data;
							break;
						case "eew":
              this.logger.info("data eew:", json.payload.payload.data);
              this.data.eew = json.payload.payload.data;
              if (this.TREM.variable.play_mode == 1) this.processEEWData(this.data.eew);
              break;
            case "intensity":
              this.logger.info("data intensity:", json.payload.payload.data);
              this.data.intensity = json.payload.payload.data;
              if (this.TREM.variable.play_mode === 1) this.processIntensityData(this.data.intensity);
							break;
						case "report":
              this.logger.info("data report:", json.payload.payload.data);
							this.data.report = json.payload.payload.data;
              if (this.TREM.variable.play_mode === 1) {
                const url = this.TREM.constant.URL.API[Math.floor(Math.random() * this.TREM.constant.URL.API.length)];
                const data = json.payload.payload.data;
                if (data) {
                  this.TREM.variable.events.emit('ReportRelease', { info: { url }, data });
                }
              }
							break;
						case "rtw":
							this.data.rtw = json.payload.payload.data;
              this.TREM.variable.events.emit('rtwsend', this.data.rtw);
							break;
            case "lpgm":
              this.logger.info("data lpgm:", json.payload.payload.data);
              this.data.lpgm = json.payload.payload.data;
              break;
            default:
              this.logger.info("data:", json);
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

  isAreaDifferent(area1, area2) {
    if (!area1 || !area2) {
      return true;
    }

    const keys1 = Object.keys(area1);
    const keys2 = Object.keys(area2);

    if (keys1.length !== keys2.length) {
      return true;
    }

    return keys1.some((key) => {
      const arr1 = area1[key] || [];
      const arr2 = area2[key] || [];
      if (arr1.length !== arr2.length) {
        return true;
      }
      return !arr1.every((val) => arr2.includes(val));
    });
  }

  processIntensityData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 600 * 1000;

    this.TREM.variable.data.intensity
      .filter((item) =>
        item.id
        && (currentTime - item.id > EXPIRY_TIME || item.IntensityEnd),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit("IntensityEnd", {
          info : { type: this.TREM.variable.play_mode },
          data : { ...data, IntensityEnd: true },
        });
      });

    this.TREM.variable.data.intensity = this.TREM.variable.data.intensity.filter((item) =>
      item.id
      && currentTime - item.id <= EXPIRY_TIME
      && !item.IntensityEnd,
    );

    if (!data.id || currentTime - data.id > EXPIRY_TIME || data.IntensityEnd)
      return;


    const existingIndex = this.TREM.variable.data.intensity.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1)
      if (!this.TREM.variable.cache.intensity_last[data.id]) {
        this.TREM.variable.cache.intensity_last[data.id] = {
          last_time : currentTime,
          serial    : 1,
        };
        this.TREM.variable.data.intensity.push(data);
        this.TREM.variable.events.emit("IntensityRelease", eventData);
        return;
      }


    if (this.TREM.variable.cache.intensity_last[data.id] && this.TREM.variable.cache.intensity_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.intensity_last[data.id].serial = data.serial;
      if (this.isAreaDifferent(data.area, this.TREM.variable.data.intensity[existingIndex].area)) {
        this.TREM.variable.events.emit("IntensityUpdate", eventData);
        this.TREM.variable.data.intensity[existingIndex] = data;
      }
    }

    this.cleanupCache("intensity_last");

    this.TREM.variable.events.emit("DataIntensity", {
      info : { type: this.TREM.variable.play_mode },
      data : this.TREM.variable.data.intensity,
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