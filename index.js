#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const URL = require('url').URL;
const { Command } = require('commander');
const allSettled = require('promise.allsettled');
const ora = require('ora');
const cache = require('./cache');
const logs = require('./logs');

const program = new Command();

program
    .name('tiny')
    .option('-f, --folder <folder>', '文件夹路径', './')
    .option('-d, --deep', '递归文件夹')
    // .option('-c, --cache', '缓存压缩记录，对已压缩过图片不在进行压缩')
    .option('-v, --verbose', '显示压缩文件信息');

program.addHelpText('after', `
Example call:
$ tiny -f ./src/assets -d -v`);

program.parse(process.argv);

// 参数项
const params = program.opts();

// 图片后缀格式
const exts = ['.jpg', '.png', '.webp', '.gif', '.apng'];

// 尺寸
const maxSize = 1024 * 1024 * 5; // 5MB

// 最小压缩比例，压缩比例小于 2，将被记录到缓存数据中，下次不在压缩
const minRatio = 2;

// 待处理文件列表
const files = [];

// 压缩记录
const records = [];

const spinner = ora('图片资源搜索中，请稍等...').start();

// 收集需要处理的图片文件
function collector(folder) {
    // 获取缓存数据
    const cacheData = cache.get();

    // 读取文件夹
    fs.readdirSync(folder).forEach((file) => {
        const filePath = path.join(folder, file);

        const fileStat = fs.statSync(filePath);

        // 过滤文件安全性/大小限制/后缀名
        if (
            fileStat.isFile()
            && fileStat.size <= maxSize
            && exts.includes(path.extname(file))
            && !cacheData.includes(filePath)
        ) {
            files.push(filePath);
        } else if (params.deep && fileStat.isDirectory()) {
            // 是都要深度递归处理文件夹
            collector(filePath);
        }
    });
}

// 循环调用，请求图片数据
function fileUpdate(imgPath, obj) {
    const relativePath = imgPath.replace(process.cwd(), '');
    const rawSize = `${(obj.input.size / 1024).toFixed(2)}kb`;
    const compressedSize = `${(obj.output.size / 1024).toFixed(2)}kb`;
    const ratio = ((1 - obj.output.ratio) * 100);
    const ratioPercentage = `${(ratio).toFixed(2)}%`;

    // 如果压缩比例小于 minRatio% ，则记录到缓存中，下次不处理
    if (ratio < minRatio) {
        cache.write(imgPath);
        return Promise.resolve({ code: 200 });
    }

    spinner.text = '图片压缩中...';

    return new Promise((resolve) => {
        const url = new URL(obj.output.url);
        const req = https.request(url, (res) => {
            let body = '';
            res.setEncoding('binary');
            res.on('data', (data) => {
                body += data;
                return body;
            });
            res.on('end', () => {
                fs.writeFile(imgPath, body, 'binary', (err) => {
                    if (err) {
                        resolve({ code: -1, message: err.message || '解析错误' });
                        return;
                    }

                    records.push([relativePath, rawSize, compressedSize, ratioPercentage, '成功']);
                    resolve({ code: 200 });
                });
            });
        });
        req.on('error', (e) => {
            records.push([relativePath, rawSize, '-', '-', '失败']);
            resolve({ code: -1, message: e.message || '请求错误' });
        });
        req.end();
    });
}

/**
* TinyPng 远程压缩 HTTPS 请求
* @param {string} imgPath 待处理的文件路径
* @success {
{
    input: { size: 4685, type: 'image/png' },
    output: {
        size: 4579,
        type: 'image/png',
        width: 135,
        height: 102,
        ratio: 0.9774,
        url: 'https://tinypng.com/web/output/6ag8apge47c0d41yzagr9hv6hejh8dgj'
    }
}
* @error  {"error": "Bad request", "message" : "Request is invalid"}
*/
function uploadFile(imgPath) {
    const relativePath = imgPath.replace(__dirname, '');

    return new Promise((resolve) => {
        const randomNum = Array(4).fill(1).map(() => parseInt(Math.random() * 254 + 1, 10)).join('.');
        const req = https.request({
            method: 'POST',
            hostname: 'tinypng.com',
            path: '/backend/opt/shrink',
            headers: {
                rejectUnauthorized: false,
                'X-Forwarded-For': randomNum,
                'Postman-Token': Date.now(),
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
            }
        }, (res) => {
            res.on('data', (buf) => {
                try {
                    const result = JSON.parse(buf.toString());
                    if (result.error) {
                        records.push([relativePath, '-', '-', '-', '失败']);
                        resolve();
                    } else {
                        fileUpdate(imgPath, result)
                            .then(resolve)
                            .catch(resolve);
                    }
                } catch (err) {
                    records.push([relativePath, '-', '-', '-', '失败']);
                }
            });
        });

        req.write(fs.readFileSync(imgPath), 'binary');
        req.on('error', () => {
            records.push([relativePath, '-', '-', '-', '失败']);
            resolve();
        });
        req.end();
    });
}

// 入口
const entry = path.join(process.cwd(), params.folder);
collector(entry);

// 上传
if (files.length) {
    // 扫描文件数，参与压缩文件数，成功数，失败数
    const startTime = +new Date();
    allSettled(files.map((file) => uploadFile(file)))
        .then(() => {
            spinner.stop();
            if (records.length && params.verbose) {
                logs.logInTable(records);
            }
            const endTime = +new Date();
            const seconds = `${((endTime - startTime) / 1000).toFixed(2)}秒`;
            console.log('压缩文件数: ', files.length, '总用时: ', seconds);
        });
} else {
    spinner.stop();
    console.log('暂无需要压缩的图片资源~');
}
