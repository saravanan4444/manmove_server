const required = ['MONGO_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
    console.error('Missing required environment variables: ' + missing.join(', '));
    process.exit(1);
}
