const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const path = require('path');


const EventEmitter = require('events');
const progressEmitter = new EventEmitter();
let progress = 0;

async function scraper(datas) {
    
    const pageUrl = datas['pageUrl'];
    console.log('il link è '+ pageUrl);
    let affiliateDoctors = [];
    let nonAffiliateDoctors = [];
    let lastPage = datas.totalPages;
    let firstPage = datas.startPage;

    for (let i = firstPage; i <= lastPage; i++) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        let page_url =  pageUrl + '?page=' + i;
        await page.goto(page_url);

        const textContent = await page.evaluate(() => {
            const names = document.querySelectorAll('.Search__result-name');
            const addresses = document.querySelectorAll('.Search__result-infos > div + div > div + p + p');
            const doctorBoxes = document.querySelectorAll('.dsg-card.Search__result-container');
            const searchText = 'Nessuna disponibilità su Doctena';

            let address;
            let index = 0;
            let docUrl = [];
            let doctors = [];

            for (const element of names) {
                const url = element.querySelector('a').href;
                docUrl.push({ url });
            }

            for (let i = 0; i < names.length; i++) {
                let affiliate = !doctorBoxes[i].textContent.includes(searchText);
                let name = names[i].textContent.trim();
                address = addresses[i].textContent.trim().replace(/[\r\n]+/g, '');

                doctors.push({
                    affiliate,
                    name,
                    address
                });
            }

            return {
                docUrl: docUrl,
                doctors: doctors,
                addressLength: addresses.length
            };
        });
        
        for (let i = 0; i < textContent.docUrl.length; i++) {
            const doctorPage = await browser.newPage();
            await doctorPage.goto(textContent.docUrl[i].url);

            const language = await doctorPage.evaluate(() => {
                const languageElements = document.querySelectorAll('#agendaDetails div + span + div + div ul li:not(a)');
                const language = Array.from(languageElements).map(element => element.textContent.trim());
                return language.length > 0 ? language.filter(lang => lang.trim()).map(lang => lang.replace(/^- /, '')) : ['N/D'];
            });

            const degree = await doctorPage.evaluate(() => {
                const degreeElements = document.querySelectorAll('h3 + div + div ul li');
                const degree = Array.from(degreeElements).map(element => element.textContent.trim());
                return degree.length > 0 ? degree : ['N/D'];
            });

            const affiliatedStructures = await doctorPage.evaluate(() => {
                const strutcureElements = document.querySelectorAll('h3 + div + div + div ul li');
                const affiliatedStructures = Array.from(strutcureElements).map(element => element.textContent.trim());
                return affiliatedStructures.length > 0 ? affiliatedStructures : ['N/D'];
            });
            await doctorPage.close();
            textContent.doctors[i].language = language;
            textContent.doctors[i].degree = degree;
            textContent.doctors[i].affiliatedStructures = affiliatedStructures;
            
        }
        await browser.close();
        progress = Math.round((i*100)/lastPage);
        progressEmitter.emit('progressUpdate', progress);
        affiliateDoctors = affiliateDoctors.concat(textContent.doctors.filter(doctor => doctor.affiliate));
        nonAffiliateDoctors = nonAffiliateDoctors.concat(textContent.doctors.filter(doctor => !doctor.affiliate));
        
    }

    
    let affiliateFileCreated = false;
    let nonAffiliateFileCreated = false;

    if (affiliateDoctors.length > 0) {
        await createAndSaveExcel(affiliateDoctors, 'affiliateDoctors.xlsx');
        affiliateFileCreated = true;
    }
    if (nonAffiliateDoctors.length > 0) {
        await createAndSaveExcel(nonAffiliateDoctors, 'nonAffiliateDoctors.xlsx');
        nonAffiliateFileCreated = true;
    }

    return { affiliateFileCreated, nonAffiliateFileCreated };
}

async function createAndSaveExcel(data, fileName) {
    if (!data || data.length === 0) {
        console.error('Nessun dato da salvare nel file Excel:', fileName);
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Dati');

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
    const headerFont = { bold: true };
    const headers = Object.keys(data[0]).filter(header => header !== 'affiliate');
    const columns = [];

    headers.forEach(header => {
        if (header === 'degree') {
            columns.push({ header, key: header, width: 150 });
        } else {
            columns.push({ header, key: header, width: 35 });
        }
    });

    worksheet.columns = columns;

    const headerRow = worksheet.getRow(1);
    headerRow.fill = headerFill;
    headerRow.font = headerFont;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    data.forEach(item => {
        const row = headers.map(header => {
            let value = '';
            if (item[header]) {
                if (Array.isArray(item[header])) {
                    value = item[header].join(', ');
                } else if (typeof item[header] === 'string') {
                    value = item[header];
                }
            }
            return value;
        });

        const rowNumber = worksheet.addRow(row).number;
        worksheet.getRow(rowNumber).height = 75;

        worksheet.getRow(rowNumber).eachCell((cell, colNumber) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
    });

    const filePath = path.join('public', fileName);
    await workbook.xlsx.writeFile(filePath);
    console.log('File Excel salvato con successo:', fileName);
}

module.exports = { scraper, progressEmitter  };
