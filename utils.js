const readline = require('readline');

function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[INFO] [${timestamp}] ${message}`);
}

function logWarn(message) {
  const timestamp = new Date().toISOString();
  console.warn(`[WARN] [${timestamp}] ${message}`);
}

function logError(message, err = null) {
  const timestamp = new Date().toISOString();
  if (err) {
    console.error(`[ERROR] [${timestamp}] ${message}:`, err.message || err);
  } else {
    console.error(`[ERROR] [${timestamp}] ${message}`);
  }
}

function promptInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTimeString(date) {
  return date.toTimeString().split(' ')[0];
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  promptInput,
  sleep,
  formatTimeString,
};
