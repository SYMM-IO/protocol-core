import winston, { format, transports } from "winston"

const customLevels = {
	levels: {
		error: 0,
		warning: 1,
		contractLogs: 2,
		info: 3,
		debug: 4,
		detailedDebug: 5,
		detailedEventDebug: 6,
	},
	colors: {
		error: "red",
		warning: "yellow",
		info: "green",
		contractLogs: "green",
		debug: "blue",
		detailedDebug: "cyan",
		detailedEventDebug: "cyan",
	},
}

let logLevel = process.env.LOG_LEVEL
if (logLevel == null) logLevel = "info"
if (process.env.TEST_MODE == "static") logLevel = "error"
let conf

const detailedDebugTransport = new transports.File({
	filename: "detailedDebug.log",
	level: "detailedDebug",
	format: format.combine(format.colorize(), format.timestamp(), format.prettyPrint()),
})

switch (logLevel) {
	case "detailedEventDebug":
		conf = {
			level: "detailedEventDebug",
			format: format.combine(format.colorize(), format.timestamp(), format.prettyPrint()),
		}
		break
	case "detailedDebug":
		conf = {
			level: "detailedDebug",
			format: format.combine(format.colorize(), format.timestamp(), format.prettyPrint()),
		}
		break
	case "debug":
		conf = {
			level: "debug",
			format: format.combine(
			  format.colorize(),
			  format.timestamp(),
			  format.printf(({ level, message, timestamp }) => {
				  return `${timestamp} ${level}: ${message}`
			  }),
			),
		}
		break
	case "contractLogs":
		conf = {
			level: "contractLogs",
			format: format.combine(
			  format.colorize(),
			  format.timestamp(),
			  format.printf(({ level, message, timestamp }) => {
				  return `${timestamp} ${level}: ${message}`
			  }),
			),
		}
		break
	case "info":
		conf = {
			level: "info",
			format: format.combine(
			  format.colorize(),
			  format.timestamp(),
			  format.printf(({ level, message, timestamp }) => {
				  return `${timestamp} ${level}: ${message}`
			  }),
			),
		}
		break
	case "error":
		conf = {
			level: "error",
			format: format.combine(
			  format.colorize(),
			  format.timestamp(),
			  format.printf(({ level, message, timestamp }) => {
				  return `${timestamp} ${level}: ${message}`
			  }),
			),
		}
		break
	case "warning":
		conf = {
			level: "warning",
			format: format.combine(
			  format.colorize(),
			  format.timestamp(),
			  format.printf(({ level, message, timestamp }) => {
				  return `${timestamp} ${level}: ${message}`
			  }),
			),
		}
		break
}

export const logger: any = winston.createLogger({
	levels: customLevels.levels,
	transports: [new winston.transports.Console(conf), detailedDebugTransport],
})
winston.addColors(customLevels.colors)
