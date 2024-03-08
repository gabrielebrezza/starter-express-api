const express = require('express');
const { scraper, progressEmitter} = require('./scraper');
const path = require('path');

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/progress-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    progressEmitter.on('progressUpdate', (progress) => {
        console.log(progress);
        res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    });
});

app.post('/start-scraping', async (req, res) => {
    try {
        const datas = req.body;
        console.log('Richiesta di scraping ricevuta...');
        const { affiliateFileCreated, nonAffiliateFileCreated } = await scraper(datas);
        const response = {
            affiliateFileCreated,
            nonAffiliateFileCreated
        };
        res.json(response);
    } catch (error) {
        console.error("Si è verificato un errore durante lo scraping e il salvataggio dei dati:", error);
        res.status(500).send('Errore durante lo scraping e il salvataggio dei dati.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
