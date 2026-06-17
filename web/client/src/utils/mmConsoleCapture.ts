export {}

type MMConsoleLevel =
  | "log"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "window.error"
  | "unhandledrejection"

type MMConsoleLogEntry = {
  time: string
  level: MMConsoleLevel
  args: unknown[]
}

declare global {
  interface Window {
    __mmConsoleCaptureInstalled?: boolean
    __mmConsoleCaptureLogs?: MMConsoleLogEntry[]
    mmGetConsoleLog?: () => MMConsoleLogEntry[]
    mmClearConsoleLog?: () => void
    mmDownloadConsoleLog?: () => void
  }
}

const LIMIT = 5000

const safeSerialize = (value: unknown): unknown => {
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }

    return JSON.parse(JSON.stringify(value, (_key, v) => {
      if (typeof v === "function") return "[Function]"

      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
        }
      }

      if (typeof MediaStream !== "undefined" && v instanceof MediaStream) {
        return `[MediaStream id=${v.id}]`
      }

      if (typeof MediaStreamTrack !== "undefined" && v instanceof MediaStreamTrack) {
        return `[MediaStreamTrack kind=${v.kind} id=${v.id} state=${v.readyState}]`
      }

      return v
    }))
  } catch {
    try {
      return String(value)
    } catch {
      return "[Unserializable]"
    }
  }
}

const installMMConsoleCapture = () => {
  if (typeof window === "undefined") return

  if (window.__mmConsoleCaptureInstalled) return

  window.__mmConsoleCaptureInstalled = true
  window.__mmConsoleCaptureLogs = window.__mmConsoleCaptureLogs ?? []

  const logs = window.__mmConsoleCaptureLogs

  const original = {
    log: console.log.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  const push = (level: MMConsoleLevel, args: unknown[]) => {
    logs.push({
      time: new Date().toISOString(),
      level,
      args: args.map(safeSerialize),
    })

    if (logs.length > LIMIT) {
      logs.splice(0, logs.length - LIMIT)
    }
  }

  ;(["log", "debug", "info", "warn", "error"] as const).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      push(level, args)
      original[level](...args)
    }
  })

  window.addEventListener("error", (event) => {
    push("window.error", [
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      },
    ])
  })

  window.addEventListener("unhandledrejection", (event) => {
    push("unhandledrejection", [
      {
        reason: event.reason,
      },
    ])
  })

  window.mmGetConsoleLog = () => logs.slice()

  window.mmClearConsoleLog = () => {
    logs.length = 0
    original.info("[MM][capture] cleared")
  }

  window.mmDownloadConsoleLog = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      logCount: logs.length,
      logs,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")

    a.href = url
    a.download = `melodymine-console-${new Date().toISOString().replace(/[:.]/g, "-")}.json`

    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    URL.revokeObjectURL(url)
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase()

    if (event.ctrlKey && event.altKey && event.shiftKey && key === "l") {
      event.preventDefault()
      window.mmDownloadConsoleLog?.()
    }
  })

  original.info("[MM][capture] installed. Use Ctrl+Alt+Shift+L to export.")
}

installMMConsoleCapture()
