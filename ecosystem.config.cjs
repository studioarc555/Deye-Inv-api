module.exports = {
  apps: [
    {
      name: "deye-inv-api",
      script: "dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
