export function sendMessageWithRetry(
  msg: object,
  callback?: (res: any) => void,
  retries = 5,
  delayMs = 300
) {
  const attempt = (remaining: number) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (remaining > 0 && errMsg.includes('Receiving end does not exist')) {
            setTimeout(() => attempt(remaining - 1), delayMs);
          } else {
            callback?.(undefined);
          }
          return;
        }
        callback?.(res);
      });
    } catch {
      if (remaining > 0) {
        setTimeout(() => attempt(remaining - 1), delayMs);
      } else {
        callback?.(undefined);
      }
    }
  };
  attempt(retries);
}

