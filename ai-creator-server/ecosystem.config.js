module.exports = {
  apps: [
    {
      name: 'ai-creator-server',
      cwd: './server',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      watch: false,
    },
  ],
};
