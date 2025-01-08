const WebSocket = require("../node_modules/ws/index");

const logger = require("./utils/logger");

class Server {
  static instance;

  constructor(urls, config, exptech_config, TREM, MixinManager) {
    if (Server.instance)
      return Server.instance;


    this.urls = urls;
    this.ws = null;
    this.reconnect = true;
    this.info_get = false;

    this.config = config;
    this.exptech_config = exptech_config;
    this.get_exptech_config = this.exptech_config.getConfig();
    this.TREM = TREM;
    // this.TREM.variable.events.on('MapLoad', () => {
    //   setInterval(async () => {
    //     await this.fetchData();
    //   }, 0);
    // });

    let rts = null, eew = null, intensity = null, lpgm = null, tsunami = null, report = null, rtw = null;
    this.data = { rts, eew, intensity, lpgm, tsunami, report, rtw };

    this.wsConfig = {
      type    : "start",
      service : this.config.service,
      key     : this.get_exptech_config.user.token ?? "",
    };

    this.connect();
    this.ws_time = 0;

    setInterval(() => {
      if ((Date.now() - this.ws_time > 30_000 && this.ws_time != 0)) {
        this.connect();
      }
    }, 3000);

    // MixinManager.inject(TREM.class.DataManager, "fetchData", this.fetchData, "start");

    Server.instance = this;
  }

  connect() {
    if (!this.reconnect) return;
    if (this.ws) this.ws.terminate();
    this.ws = null;
    const url = `wss://${this.urls[Math.floor(Math.random() * this.urls.length)]}/websocket`;
    this.ws = new WebSocket(url);
    logger.info("websocket connecting to -> ", url);
    this.ws_event();
  }

  ws_event() {
    this.ws.onclose = () => {
      this.ws = null;
      logger.warn("WebSocket close");

      setTimeout(this.connect, 3000);
    };

    this.ws.onerror = (error) => {
      logger.error("WebSocket error:", error);
    };

    this.ws.onopen = () => {
      logger.info("WebSocket open");

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
            logger.info("WebSocket close -> 401");
            this.ws.close();
          } else if (json.data.code == 200) {
            this.ws_time = Date.now();
            if (!this.info_get) {
              this.info_get = true;
              logger.info("info:", json.data);
              if (json.data.list.includes("trem.eew")) {
                this.TREM.constant.EEW_AUTHOR.push("cwa");
                logger.info("EEW_AUTHOR:", this.TREM.constant.EEW_AUTHOR);
              }
            }
          } else if (json.data.code == 400) {
            this.send(this.wsConfig);
          }
          break;
        }
        case "data":{
          if (this.TREM.variable.play_mode === 0) this.TREM.variable.play_mode = 1;
          switch (json.data.type) {
            case "rts":
              this.ws_time = Date.now();
              this.data.rts = json.data.data;
              if (this.TREM.variable.play_mode === 1) {
                this.TREM.variable.data.rts = this.data.rts;
                this.TREM.variable.events.emit('DataRts', {
                  info: { type: this.TREM.variable.play_mode },
                  data: this.data.rts,
                });
                this.TREM.variable.cache.last_data_time = this.ws_time;
                if (this.data.rts.int.length == 0) {
                  this.processEEWData();
                }
              }
              break;
            case "tsunami":
							this.data.tsunami = json.data;
							// break;
						case "eew":
              logger.info("data eew:", json.data);
							this.data.eew = json.data;
              if (this.TREM.variable.play_mode === 1) this.processEEWData(this.data.eew);
							break;
						case "intensity":
              logger.info("data intensity:", json.data);
							this.data.intensity = json.data;
              if (this.TREM.variable.play_mode === 1) this.processIntensityData(this.data.intensity);
							break;
						case "report":
							this.data.report = json.data;
							// break;
						case "rtw":
							this.data.rtw = json.data;
							break;
            case "lpgm":
              logger.info("data lpgm:", json.data);
              this.data.lpgm = json.data;
              if (this.TREM.variable.play_mode === 1) this.processLpgmData(this.data.lpgm);
              break;
            default:
              logger.info("data:", json.data);
          }
          break;
        }
        case "ntp":{
          this.ws_time = Date.now();
          break;
        }
        default:{
          logger.info("json:", json);
        }
      }
    };
  }

  send(data) {
    if (this.ws) this.ws.send(JSON.stringify(data));
  }

  async fetchData() {
    if (this.TREM.variable.play_mode === 1) {
      // realtime (websocket)
      const localNow_ws = Date.now();
      if (localNow_ws - this.lastFetchTime < 100) {
        return;
      }
      this.lastFetchTime = localNow_ws;

      if (!this.TREM.variable.data.rts
        || (!this.data.rts && ((localNow_ws - this.TREM.variable.cache.last_data_time) > this.TREM.constant.LAST_DATA_TIMEOUT_ERROR))
        || this.TREM.variable.data.rts.time < (this.data.rts?.time ?? 0)) {
        this.TREM.variable.data.rts = this.data.rts;
        this.TREM.variable.events.emit('DataRts', {
          info: { type: this.TREM.variable.play_mode },
          data: this.data.rts,
        });
      }

      if (this.data.eew) {
        this.processEEWData(this.data.eew);
      }
      else {
        this.processEEWData();
      }

      if (this.data.intensity) {
        this.processIntensityData(this.data.intensity);
      }

      if (this.data.lpgm) {
        this.processLpgmData(this.data.lpgm);
      }

      if (this.data.rts) {
        this.TREM.variable.cache.last_data_time = localNow_ws;
      }

      return null;
    }
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
        this.TREM.variable.events.emit('EewEnd', {
          info: { type: this.TREM.variable.play_mode },
          data: { ...data, EewEnd: true },
        });
      });

    this.TREM.variable.data.eew = this.TREM.variable.data.eew.filter((item) =>
      item.eq?.time
      && currentTime - item.eq.time <= EXPIRY_TIME
      && !item.EewEnd
      && !(item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT),
    );

    if (!data.eq?.time || currentTime - data.eq.time > EXPIRY_TIME || data.EewEnd) {
      return;
    }

    const existingIndex = this.TREM.variable.data.eew.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1) {
      if (!this.TREM.variable.cache.eew_last[data.id]) {
        if (this.TREM.constant.EEW_AUTHOR.includes(data.author)) {
          this.TREM.variable.cache.eew_last[data.id] = {
            last_time: currentTime,
            serial: 1,
          };
          this.TREM.variable.data.eew.push(data);
          this.TREM.variable.events.emit('EewRelease', eventData);
        }
        return;
      }
    }

    if (this.TREM.variable.cache.eew_last[data.id] && this.TREM.variable.cache.eew_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.eew_last[data.id].serial = data.serial;

      if (data.status === 3) {
        data.status3Time = currentTime;
      }

      this.TREM.variable.events.emit('EewUpdate', eventData);

      if (!this.TREM.variable.data.eew[existingIndex].status && data.status == 1) {
        this.TREM.variable.events.emit('EewAlert', eventData);
      }

      this.TREM.variable.data.eew[existingIndex] = data;
    }

    this.cleanupCache('eew_last');

    this.TREM.variable.events.emit('DataEew', {
      info: { type: this.TREM.variable.play_mode },
      data: this.TREM.variable.data.eew,
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
        this.TREM.variable.events.emit('IntensityEnd', {
          info: { type: this.TREM.variable.play_mode },
          data: { ...data, IntensityEnd: true },
        });
      });

      this.TREM.variable.data.intensity = this.TREM.variable.data.intensity.filter((item) =>
      item.id
      && currentTime - item.id <= EXPIRY_TIME
      && !item.IntensityEnd,
    );

    if (!data.id || currentTime - data.id > EXPIRY_TIME || data.IntensityEnd) {
      return;
    }

    const existingIndex = this.TREM.variable.data.intensity.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1) {
      if (!this.TREM.variable.cache.intensity_last[data.id]) {
        this.TREM.variable.cache.intensity_last[data.id] = {
          last_time: currentTime,
          serial: 1,
        };
        this.TREM.variable.data.intensity.push(data);
        this.TREM.variable.events.emit('IntensityRelease', eventData);
        return;
      }
    }

    if (this.TREM.variable.cache.intensity_last[data.id] && this.TREM.variable.cache.intensity_last[data.id].serial < data.serial) {
      this.TREM.variable.cache.intensity_last[data.id].serial = data.serial;
      if (this.isAreaDifferent(data.area, this.TREM.variable.data.intensity[existingIndex].area)) {
        this.TREM.variable.events.emit('IntensityUpdate', eventData);
        this.TREM.variable.data.intensity[existingIndex] = data;
      }
    }

    this.cleanupCache('intensity_last');

    this.TREM.variable.events.emit('DataIntensity', {
      info: { type: this.TREM.variable.play_mode },
      data: this.TREM.variable.data.intensity,
    });
  }

  processLpgmData(data = {}) {
    const currentTime = this.now();
    const EXPIRY_TIME = 600 * 1000;

    this.TREM.variable.data.lpgm
      .filter((item) =>
        item.time
        && (currentTime - item.time > EXPIRY_TIME || item.LpgmEnd),
      )
      .forEach((data) => {
        this.TREM.variable.events.emit('LpgmEnd', {
          info: { type: this.TREM.variable.play_mode },
          data: { ...data, LpgmEnd: true },
        });
      });

    this.TREM.variable.data.lpgm = this.TREM.variable.data.lpgm.filter((item) =>
      item.time
      && currentTime - item.time <= EXPIRY_TIME
      && !item.LpgmEnd,
    );

    if (!data.id || data.LpgmEnd) {
      return;
    }

    const existingIndex = this.TREM.variable.data.lpgm.findIndex((item) => item.id == data.id);
    const eventData = {
      info: { type: this.TREM.variable.play_mode },
      data,
    };

    if (existingIndex == -1) {
      data.id = Number(data.id);
      data.time = this.now();
      this.TREM.variable.data.lpgm.push(data);
      this.TREM.variable.events.emit('LpgmRelease', eventData);
    }

    this.TREM.variable.events.emit('DataLpgm', {
      info: { type: this.TREM.variable.play_mode },
      data: this.TREM.variable.data.lpgm,
    });
  }

  cleanupCache(cacheKey) {
    const currentTime = this.now();
    Object.keys(this.TREM.variable.cache[cacheKey]).forEach((id) => {
      const item = this.TREM.variable.cache[cacheKey][id];
      if (currentTime - item.last_time > 600000) {
        delete this.TREM.variable.cache[cacheKey][id];
      }
    });
  }

  now() {
    if (this.TREM.variable.play_mode == 2 || this.TREM.variable.play_mode == 3) {
      if (!this.TREM.variable.replay.local_time) {
        this.TREM.variable.replay.local_time = Date.now();
      }

      return this.TREM.variable.replay.start_time + (Date.now() - this.TREM.variable.replay.local_time);
    }

    if (!this.TREM.variable.cache.time.syncedTime || !this.TREM.variable.cache.time.lastSync) {
      return Date.now();
    }

    const offset = Date.now() - this.TREM.variable.cache.time.lastSync;
    return this.TREM.variable.cache.time.syncedTime + offset;
  }
}

module.exports = Server;