const app = require('./src/app');

const http = require('http');
const server = http.createServer(app);
server.listen(0, () => {
    const port = server.address().port;
    console.log(`Test server listening on ${port}`);
    
    // Test the specific route
    const req = http.get(`http://localhost:${port}/api/scrape/scrape-banks`, (res) => {
        console.log(`Initial Status: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log(`Body: ${data.substring(0, 200)}...`);
            server.close();
        });
    });
});
