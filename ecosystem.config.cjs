module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        // OPENAI_API_KEY should be set in environment or .dev.vars file
        // OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}