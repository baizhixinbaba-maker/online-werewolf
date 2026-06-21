module.exports = {
  apps: [
    {
      name: "online-werewolf",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "80",
      },
    },
  ],
};
