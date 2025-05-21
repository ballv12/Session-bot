module.exports = {
  apps: [{
    name: "session-bot",
    script: "index.js",
    watch: true,
    env: {
      "NODE_ENV": "production",
    }
  }]
} 