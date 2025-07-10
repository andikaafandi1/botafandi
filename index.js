require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const clc = require("cli-color");
const moment = require("moment-timezone");
const figlet = require("figlet");

const HandleHears = require("./src/handler/HandleHears");
const handleHears = new HandleHears();

const HandleAction = require("./src/handler/HandleAction");
const handleAction = new HandleAction();

moment.tz.setDefault("Asia/Jakarta");

const connectDatabase = require("./src/database/connect");
const command = require("./src/command/exportCommand");

const middleware = require("./src/middleware/middleware");
const ProcessingTransaction = require("./ProcessTransaction");

const token_bot = process.env.BOT_TOKEN;

if (
  !token_bot ||
  !process.env.WHITELIST_ID ||
  !process.env.DATABASE_MONGODB_URI ||
  !process.env.QRCODE_TEXT ||
  !process.env.APIKEY_ORKUT ||
  !process.env.MERCHANT_KEY
) {
  console.error("Harap isi semua yang ada di file .env");
  process.exit(1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

var bot = new Telegraf(token_bot);

bot.telegram.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "infobot", description: "Info Bot" },
  { command: "adminmenu", description: "Open admin panel" },
]);

bot.on("text", (ctx, next) => middleware(ctx, next));

//help command
bot.command("carasetharga", command.caraSetHarga);
bot.command("caradelvariant", command.caraDelVariant);
bot.command("caraaddstock", command.caraAddStock);
bot.command("caraaddproduct", command.caraAddProduct);
bot.command("caraaddvariant", command.caraAddVariant);
bot.command("carabroadcast", command.caraBroadcast);
bot.command("caradelstock", command.caraDelStock);
bot.command("caradelproduct", command.caraDelProduct);

bot.start(command.startCommand);
bot.command(["addstock", "addstok"], command.addStock);
bot.command(["addproduct", "addproduk"], command.addProduct);
bot.command("broadcast", command.broadcastCommand);
bot.command(
  ["addproductvariant", "addproductvariants", "addvariant", "addvariants"],
  command.addProductVariants
);
bot.command("adminmenu", command.adminPanelCommand);
bot.command("help", command.helpCommand);
bot.command(["delproduk", "delproduct", "delproducts"], command.delProduct);
bot.command(
  [
    "delvariant",
    "delvariants",
    "delproductvariant",
    "delproductvariants",
    "delprodukvariant",
    "delprodukvariants",
  ],
  command.delProductVariant
);
bot.command(["delstock", "delstocks"], command.delStock);
bot.command("setharga", command.setHarga);
bot.command("infobot", (ctx) => {
  try {
    const text =
      "*❖ Creator Bot : Secret*\n*❖ Version : V3.0*\n\n*Want to buy my bot?? Chat me on Whatsapp Click below👇*";

    ctx.replyWithMarkdown(text, {
      ...Markup.inlineKeyboard([
        [Markup.button.url("Whatsapp🪀", "https://wa.me/6289663455926")],
        [
          Markup.button.url(
            "Youtube📺",
            "https://www.youtube.com/@andikaafandi"
          ),
        ],
      ]),
    });
  } catch (err) {
    ctx.reply("*⚠️SOMETHING ERROR IN COMMAND INFO BOT⚠️*", {
      parse_mode: "Markdown",
    });
    console.log(
      clc.red.bold("[ INFO ]") +
        ` [${moment().format("HH:mm:ss")}]:` +
        clc.blueBright(
          ` Something error in file command/start.js  ${err.message}`
        )
    );
  }
});

//hears
bot.hears(/^\d+$/, (ctx) => handleHears.handleProductList(ctx));
bot.hears("BEST PRODUCT💰", (ctx) => handleHears.GetTopProduct(ctx))
bot.hears("TOP BUYER👑", (ctx) => handleHears.GetTopBuyer(ctx))
bot.hears("LIST PRODUCT📦", command.listProduct);
bot.hears("HOW TO ORDER❓", command.helpCommand);

//action
bot.action(/^variant-(.+)$/, (ctx) => handleAction.ShowPesanan(ctx));
bot.action(["plus-order", "mines-order"], (ctx) =>
  handleAction.PlusMinesStockProduct(ctx)
);
bot.action("confirm-order", (ctx) => handleAction.ConfirmOrder(ctx));
bot.action("show-code-variant", (ctx) => {
  ctx.deleteMessage();
  handleAction.showAllproductVariant(ctx);
});
bot.action("back-to-adminmenu", (ctx) => {
  ctx.deleteMessage();
  command.adminPanelCommand(ctx);
});
bot.action("cancel-order-pesanan", (ctx) => handleAction.cancelOrder(ctx));
bot.action(["back-to-product-list", "back-to-listproduct"], async (ctx) => {
  await delay(1_800);
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    const messageId = ctx.callbackQuery.message.message_id;

    await ctx.deleteMessage(messageId);
  }
  await command.listProduct(ctx);
});

bot.telegram.getMe().then(async (me) => {
  console.clear();
  console.log(await clc.blue(await figlet("BOT AFANDI STORE!")));
  console.log(
    clc.green.bold("[ INFO ]") +
      ` [${moment().format("HH:mm:ss")}]:` +
      clc.blueBright(` Succes connect to bot ${me.username}`)
  );
  await connectDatabase();
});

bot.launch();

let isProcessing = false;
setInterval(async () => {
  if (!isProcessing) {
    isProcessing = true;
    await ProcessingTransaction(bot);
    isProcessing = false;
  }
}, 7_000);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
