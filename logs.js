const Table = require('cli-table2');

const logInTable = (records = []) => {
    const table = new Table({
        head: ['文件', '原始大小', '压缩后大小', '压缩比例', '状态'],
    });

    table.push(...records);

    // 输出表格显示
    console.log(table.toString());
};

module.exports = {
    logInTable
};
