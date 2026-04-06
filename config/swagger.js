const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'ManMove API',
            version: '1.0.0',
            description: 'ManMove Field Operations Server API'
        },
        servers: [
            { url: '/api/v1', description: 'Current' },
            { url: '/rest/api/latest', description: 'Legacy' }
        ],
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
            }
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth', description: 'Login, logout, token refresh' },
            { name: 'Users', description: 'Field users, location, attendance' },
            { name: 'Customers', description: 'ISP leads and customers' },
            { name: 'Companies', description: 'Companies and zones' },
            { name: 'Inventory', description: 'Equipment inventory' },
            { name: 'Projects', description: 'ANPR projects, poles, worklogs' },
            { name: 'Cameras', description: 'Camera installation and maintenance' },
            { name: 'Contracts', description: 'Contracts, work orders, assets' },
            { name: 'Content', description: 'News, threads, logs' },
        ]
    },
    apis: ['./routes/*.js']
};

module.exports = swaggerJsdoc(options);
