const fs = require('fs');

const path = require('path');

const clc = require('cli-color');

const moment = require('moment-timezone');

const transactionModels = require('./src/database/models/transactionModels');

const checkQRIS = require('./src/utils/checkQRIS');

const addStocks = require('./src/utils/addStocks');

async function ProcessingTransaction(bot) {

    try {

        // 1. Ambil semua transaksi yang masih pending dari database

        const pendingTransactions = await transactionModels.find({ isSuccess: false, isCanceled: false });

        // Jika tidak ada transaksi pending, tidak perlu melakukan apa-apa

        if (pendingTransactions.length === 0) {

            // console.log(clc.yellow("[ DEBUG ]") + ` [${moment().format('HH:mm:ss')}]: Tidak ada transaksi pending.`);

            return;

        }

        console.log(clc.cyan("[ DEBUG ]") + ` [${moment().format('HH:mm:ss')}]: Ditemukan ${pendingTransactions.length} transaksi pending.`);

        // 2. Cek transaksi yang sudah kadaluarsa terlebih dahulu

        for (const transaction of pendingTransactions) {

            const givenTime = moment(transaction.formattedDate, "YYYY-MM-DD HH:mm:ss");

            const currentTime = moment();

            const diffMinutes = currentTime.diff(givenTime, 'minutes');

            if (diffMinutes >= 6) {

                console.log(clc.yellow.bold("[ KADALUARSA ]") + ` [${moment().format('HH:mm:ss')}]: Transaksi ${transaction.transactionId} telah kadaluarsa.`);

                await transactionModels.updateOne({ transactionId: transaction.transactionId }, { $set: { isCanceled: true } });

                await bot.telegram.deleteMessage(transaction.chatId, transaction.messageId);

                await bot.telegram.sendMessage(transaction.chatId, `*Transaksi dengan ID ${transaction.transactionId} telah kadaluarsa.*\n\n*Pesanan otomatis dibatalkan ❌.*`, { parse_mode: "Markdown" });

                await addStocks(transaction.orderData, transaction.productCode);

            }

        }

        // 3. Panggil API untuk cek mutasi pembayaran

        const mutasiData = await checkQRIS();

        

        // --- INI BAGIAN PENTING YANG DIPERBAIKI ---

        // Cek apakah `mutasiData` adalah array yang valid dan memiliki isi

        if (!mutasiData || !Array.isArray(mutasiData) || mutasiData.length === 0) {

            console.log(clc.yellow("[ DEBUG ]") + ` [${moment().format('HH:mm:ss')}]: Tidak ada data mutasi baru dari API atau terjadi error.`);

            // Tampilkan respons mentah untuk debugging jika tidak sesuai format

            if(mutasiData) console.log(clc.yellow("[ DEBUG ]") + ` Respons mentah dari API: ${JSON.stringify(mutasiData)}`);

            return;

        }

        console.log(clc.cyan("[ DEBUG ]") + ` [${moment().format('HH:mm:ss')}]: Diterima ${mutasiData.length} data mutasi dari API.`);

        // 4. Cocokkan setiap transaksi pending dengan data mutasi yang ada

        // Menggunakan for...of agar async/await berjalan dengan benar

        for (const transaction of pendingTransactions) {

            // Lewati transaksi yang mungkin sudah ditandai kadaluarsa di loop sebelumnya

            if (transaction.isCanceled) continue;

            for (const data of mutasiData) {

                const paymentTime = moment(data.date, "YYYY-MM-DD HH:mm:ss");

                const currentTime = moment();

                const diffMinutes = currentTime.diff(paymentTime, 'minutes');

                // Log untuk debugging pencocokan

                // console.log(clc.magenta(`[ CHECK ] Mencocokkan DB: Rp ${transaction.totalPrice} vs API: Rp ${data.amount} | Waktu: ${diffMinutes} menit lalu`));

                // Kondisi pencocokan

                if (parseInt(data.amount) === parseInt(transaction.totalPrice) && diffMinutes < 7) {

                    

                    // Pastikan transaksi ini belum diproses

                    const freshTransaction = await transactionModels.findOne({ transactionId: transaction.transactionId });

                    if (freshTransaction.isSuccess || freshTransaction.isCanceled) {

                        console.log(clc.yellow(`[ INFO ] Transaksi ${transaction.transactionId} sudah diproses, dilewati.`));

                        continue; // Lanjut ke data mutasi berikutnya

                    }

                    console.log(clc.green.bold("[ MATCH! ]") + ` [${moment().format('HH:mm:ss')}]:` + clc.blueBright(` Ditemukan pembayaran untuk transaksi ${transaction.transactionId}!`));

                    

                    await bot.telegram.deleteMessage(transaction.chatId, transaction.messageId);

                    await transactionModels.updateOne({ transactionId: transaction.transactionId }, { $set: { isSuccess: true } });

                    console.log(clc.green.bold("[ INFO ]") + ` [${moment().format('HH:mm:ss')}]:` + clc.blueBright(` Berhasil mengirim data produk ke ${transaction.chatId} (${transaction.transactionId})`));

                    await bot.telegram.sendMessage(transaction.chatId,

                        `─-─-─-⟨ *TRANSAKSI SUKSES 🎉* ⟩-─-─-\n` +

                        `│ • *ID Transaksi :* \`${transaction.transactionId}\`\n` +

                        `│ • *Kode Produk :* ${transaction.productCode.toUpperCase()}\n` +

                        `│ • *Total Dibayar :* Rp ${transaction.totalPrice.toLocaleString('id-ID')}\n` +

                        `─-─-─-─-─-─-─-─\n` +

                        `─-─-─-⟨ *KETERANGAN PRODUK 📜* ⟩-─-─-\n` +

                        `│ 📜 ${transaction.keteranganVariant}\n` +

                        `─-─-─-─-─-─-─-─\n` +

                        `╰─➤ *Data barang yang dibeli ada di file .txt di bawah ini 👇*`,

                        { parse_mode: "Markdown" }

                    );

                    const filePath = path.join(__dirname, `./src/database/dataTxt/${transaction.transactionId}.txt`);

                    fs.writeFileSync(filePath, transaction.orderData);

                    await bot.telegram.sendDocument(transaction.chatId, { source: filePath });

                    

                    fs.unlinkSync(filePath); // Hapus file setelah dikirim

                    // Setelah transaksi berhasil diproses, kita bisa keluar dari loop mutasi untuk transaksi ini

                    break; 

                }

            }

        }

    } catch (error) {

        console.error(clc.red.bold("[ FATAL ERROR ]") + ` [${moment().format('HH:mm:ss')}]:` + clc.blueBright(` Error di ProcessingTransaction: ${error.message}`), error.stack);

    }

}

module.exports = ProcessingTransaction;