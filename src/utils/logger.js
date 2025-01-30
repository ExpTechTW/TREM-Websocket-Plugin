let globalInstance = null;
let CustomLoggerClass = null;

function createCustomLogger(BaseLogger) {
  if (CustomLoggerClass && globalInstance)
    return {
      CustomLogger : CustomLoggerClass,
      instance     : globalInstance,
    };

  class CustomLogger extends BaseLogger {
    constructor(prefix = "") {
      super();

      if (globalInstance) {
        globalInstance.prefix = prefix;
        return globalInstance;
      }

      this.prefix = prefix;
      globalInstance = this;
    }

    _formatMessage(message, ...args) {
      const formattedMessage = super._formatMessage(message, ...args);
      return this.prefix ? `[${this.prefix}] ${formattedMessage}` : formattedMessage;
    }
  }

  CustomLoggerClass = CustomLogger;

  return {
    CustomLogger,
    instance: globalInstance,
  };
}

function checkInitialized() {
  if (!globalInstance)
    throw new Error("Logger not initialized. Please call createCustomLogger first.");
}

module.exports = {
  createCustomLogger,
  info: (...args) => {
    checkInitialized();
    return globalInstance.info(...args);
  },
  error: (...args) => {
    checkInitialized();
    return globalInstance.error(...args);
  },
  warn: (...args) => {
    checkInitialized();
    return globalInstance.warn(...args);
  },
  debug: (...args) => {
    checkInitialized();
    return globalInstance.debug(...args);
  },
  get prefix() {
    checkInitialized();
    return globalInstance.prefix;
  },
};