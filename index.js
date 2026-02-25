const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Colors,
  ActivityType,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const config = require("./Config/Config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ====== 절대 죽지 않게 ======
client.on("error", (e) => console.log("[client error]", e));
process.on("unhandledRejection", (e) => console.log("[unhandledRejection]", e));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= 서버 제한 ================= */
function inAllowedGuild(msg) {
  return !!msg.guild && msg.guild.id === config.guildId;
}

/* ================= 관리자 권한 체크 (Owner or config 역할이름) ================= */
function isAllowed(msg) {
  if (!inAllowedGuild(msg)) return false;
  if (msg.author.id === config.ownerId) return true;

  const allowed = Array.isArray(config.allowedRoleNames) ? config.allowedRoleNames : [];
  return msg.member?.roles?.cache?.some((r) => allowed.includes(r.name)) ?? false;
}

/* ================= 오늘 채팅 카운트 (안전) ================= */
const statsPath = path.join(__dirname, "stats.json");

function kstTodayKey() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readStats() {
  if (!fs.existsSync(statsPath)) {
    const init = { date: kstTodayKey(), chat: {} };
    fs.writeFileSync(statsPath, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const s = JSON.parse(fs.readFileSync(statsPath, "utf8"));
    if (!s || typeof s !== "object") throw 0;
    if (!s.chat) s.chat = {};
    return s;
  } catch {
    const init = { date: kstTodayKey(), chat: {} };
    fs.writeFileSync(statsPath, JSON.stringify(init, null, 2));
    return init;
  }
}

function writeStats(s) {
  fs.writeFileSync(statsPath, JSON.stringify(s, null, 2));
}

let stats = readStats();

function bumpChat(guildId) {
  const today = kstTodayKey();
  if (stats.date !== today) stats = { date: today, chat: {} };
  stats.chat[guildId] = (stats.chat[guildId] || 0) + 1;
  if (stats.chat[guildId] % 20 === 0) writeStats(stats);
}

/* ================= HELP UI ================= */
function helpEmbed(prefix) {
  const lines = [
    "🔊 **음성**",
    `\`[음성체크]\` — 현재 통화방 총 인원`,
    "",
    "💬 **채팅**",
    `\`[오늘채팅]\` — 오늘 서버 전체 채팅 수`,
    "",
    "🎮 **게임/재미**",
    `\`[가위바위보 가위/바위/보]\``,
    `\`[숫자게임 시작]\` / \`[숫자 1~100]\` / \`[숫자게임 종료]\``,
    `\`[수학퀴즈]\` — 10초 안에 답 맞추기`,
    `\`[랜덤선택 a | b | c]\``,
    `\`[8ball 질문]\``,
    "",
    "🧰 **유틸**",
    `\`[핑]\` — 봇 지연시간`,
    `\`[동전]\` — 앞/뒤`,
    `\`[주사위 (숫자)]\` — 예: ${prefix}주사위 100`,
    `\`[서버정보]\``,
    `\`[유저정보 @멘션]\``,
    `\`[아바타 @멘션]\``,
    "",
    "👑 **관리자 명령어는**",
    `\`${prefix}rhelp\` 로 확인`,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle("📋 명령어 목록 (멤버용)")
    .setColor(0x2b2d31)
    .setDescription(lines);
}

function rhelpEmbed(prefix) {
  const lines = [
    "📣 **공지 DM**",
    `\`[공지 메시지]\` — 전체 DM`,
    `\`[공지역할 @역할 메시지]\` — 역할 DM`,
    `\`[공지선택 @유저들 메시지]\` — 선택 DM`,
    `\`[공지중지]\` — 전송 중지`,
    "",
    "🧹 **관리**",
    `\`[청소 숫자]\` — 1~100`,
    `\`[슬로우 초]\` — 0~21600`,
    `\`[잠금]\` / \`[해제]\` — 채팅 잠금`,
    `\`[닉변경 @유저 이름]\``,
    `\`[상태변경 내용]\``,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle("🛠 관리자 명령어 (rhelp)")
    .setColor(Colors.Red)
    .setDescription(lines);
}

/* ================= DM 공지 ================= */
function progressBar(percent) {
  const size = 20;
  const p = Math.max(0, Math.min(100, Math.floor(percent)));
  const filled = Math.round((p / 100) * size);
  return "[" + "█".repeat(filled) + "░".repeat(size - filled) + "]";
}

function noticeEmbed({ done, percent, total, sent, success, fail }) {
  return new EmbedBuilder()
    .setTitle(done ? "✅ 공지 전송 완료!" : "📣 공지 전송 중...")
    .setColor(done ? Colors.Green : Colors.Orange)
    .setDescription(
      [
        `${progressBar(percent)} ${percent}%`,
        "",
        `• 전체: ${total}명`,
        `• 전송됨: ${sent}명`,
        `• 성공: ${success}명`,
        `• 실패: ${fail}명`,
      ].join("\n")
    );
}

function errEmbed(text) {
  return new EmbedBuilder().setColor(Colors.Red).setDescription(text);
}

async function safeDM(user, content) {
  try {
    await user.send({ content });
    return true;
  } catch {
    return false;
  }
}

// ✅ REST로 멤버 1000명씩 가져오기 (opcode 8 회피)
async function listAllMembers(guild) {
  const out = [];
  let after = "0";

  while (true) {
    let batch;
    try {
      batch = await guild.members.list({ limit: 1000, after });
    } catch (e) {
      const retry = Math.ceil((e?.data?.retry_after || 2) * 1000);
      await sleep(Math.min(Math.max(retry, 2000), 15000));
      continue;
    }

    if (!batch || batch.size === 0) break;

    for (const [, m] of batch) out.push(m);
    after = batch.last().id;

    if (batch.size < 1000) break;
    await sleep(120);
  }
  return out;
}

function normalizeUsersFromMembers(members) {
  const map = new Map();
  for (const m of members) {
    const u = m?.user;
    if (!u) continue;
    if (config.skipBots && u.bot) continue;
    map.set(u.id, u);
  }
  return [...map.values()];
}

// 서버당 1개 공지 프로세스
const processes = new Map(); // guildId -> { running: boolean, cancel: boolean }

async function runNotice(msg, users, text) {
  const gid = msg.guild.id;

  if (processes.get(gid)?.running) {
    return msg.reply({ embeds: [errEmbed("이미 공지 전송 중임.")] });
  }
  if (!text || !text.trim()) {
    return msg.reply({ embeds: [errEmbed("메시지가 비어있음.")] });
  }

  processes.set(gid, { running: true, cancel: false });

  const total = users.length;
  let sent = 0, success = 0, fail = 0;

  const progressMsg = await msg.reply({
    embeds: [noticeEmbed({ done: false, percent: 0, total, sent, success, fail })],
  });

  for (const u of users) {
    const st = processes.get(gid);
    if (!st || st.cancel) break;

    const ok = await safeDM(u, text);
    sent++;
    if (ok) success++; else fail++;

    if (sent % (config.progressUpdateEvery || 3) === 0 || sent === total) {
      const percent = total === 0 ? 100 : Math.floor((sent / total) * 100);
      await progressMsg.edit({
        embeds: [noticeEmbed({ done: false, percent, total, sent, success, fail })],
      }).catch(() => {});
    }

    await sleep(config.dmDelayMs || 1200);
  }

  await progressMsg.edit({
    embeds: [noticeEmbed({ done: true, percent: 100, total, sent, success, fail })],
  }).catch(() => {});

  processes.set(gid, { running: false, cancel: false });
}

/* ================= 게임 상태 ================= */
const numberGame = new Map(); // channelId -> { answer, hostId }
const mathQuiz = new Map();   // channelId -> { answer, expiresAt }

/* ================= 명령어 ================= */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return;
  if (!inAllowedGuild(msg)) return; // ✅ 특정 서버만

  // 채팅 카운트
  bumpChat(msg.guild.id);

  if (!msg.content.startsWith(config.prefix)) return;

  const raw = msg.content.slice(config.prefix.length).trim();
  const parts = raw.split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();

  /* ===== 멤버 help ===== */
  if (cmd === "help" || cmd === "명령어" || cmd === "도움말") {
    return msg.reply({ embeds: [helpEmbed(config.prefix)] });
  }

  /* ===== 관리자 help ===== */
  if (cmd === "rhelp") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });
    return msg.reply({ embeds: [rhelpEmbed(config.prefix)] });
  }

  /* ===== 유틸 ===== */
  if (cmd === "오늘채팅") {
    const today = kstTodayKey();
    if (stats.date !== today) stats = { date: today, chat: {} };
    const count = stats.chat[msg.guild.id] || 0;
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`💬 오늘 서버 전체 채팅 수: **${count}개**`)]
    });
  }

  if (cmd === "음성체크") {
    let total = 0;
    for (const [, ch] of msg.guild.channels.cache) {
      if (ch.isVoiceBased?.()) total += ch.members?.size || 0;
    }
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🔊 현재 통화방 총 인원: **${total}명**`)]
    });
  }

  if (cmd === "핑") {
    const ping = Math.round(client.ws.ping);
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🏓 Pong: **${ping}ms**`)]
    });
  }

  if (cmd === "동전") {
    const r = Math.random() < 0.5 ? "앞" : "뒤";
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🪙 결과: **${r}**`)]
    });
  }

  if (cmd === "주사위") {
    let max = parseInt(parts[0] || "6", 10);
    if (!Number.isFinite(max) || max < 2) max = 6;
    if (max > 1000000) max = 1000000;
    const roll = Math.floor(Math.random() * max) + 1;
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🎲 결과: **${roll}** / ${max}`)]
    });
  }

  if (cmd === "서버정보") {
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(msg.guild.name)
          .addFields(
            { name: "👥 멤버 수", value: `${msg.guild.memberCount}`, inline: true },
            { name: "📁 채널 수", value: `${msg.guild.channels.cache.size}`, inline: true },
            { name: "📅 생성일", value: `<t:${Math.floor(msg.guild.createdTimestamp / 1000)}:R>`, inline: false }
          )
      ]
    });
  }

  if (cmd === "유저정보") {
    const member = msg.mentions.members.first() || msg.member;
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(member.user.tag)
          .addFields(
            { name: "📅 서버 가입", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: "📆 계정 생성", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
          )
      ]
    });
  }

  if (cmd === "아바타") {
    const member = msg.mentions.members.first() || msg.member;
    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle(member.user.tag)
          .setImage(member.user.displayAvatarURL({ size: 1024 }))
      ]
    });
  }

  /* ===== 재미/게임 ===== */
  if (cmd === "가위바위보") {
    const me = (parts[0] || "").trim();
    const valid = ["가위", "바위", "보"];
    if (!valid.includes(me)) {
      return msg.reply({ embeds: [errEmbed("사용법: !가위바위보 가위/바위/보")] });
    }
    const bot = valid[Math.floor(Math.random() * 3)];
    let result = "무승부";
    if (
      (me === "가위" && bot === "보") ||
      (me === "바위" && bot === "가위") ||
      (me === "보" && bot === "바위")
    ) result = "승리";
    else if (me !== bot) result = "패배";

    return msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(`너: **${me}**\n봇: **${bot}**\n\n결과: **${result}**`)
      ]
    });
  }

  if (cmd === "랜덤선택") {
    const text = raw.slice("랜덤선택".length).trim();
    const items = text.split("|").map(s => s.trim()).filter(Boolean);
    if (items.length < 2) {
      return msg.reply({ embeds: [errEmbed("사용법: !랜덤선택 a | b | c")] });
    }
    const pick = items[Math.floor(Math.random() * items.length)];
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🎯 선택: **${pick}**`)]
    });
  }

  if (cmd === "8ball") {
    const q = parts.join(" ").trim();
    if (!q) return msg.reply({ embeds: [errEmbed("사용법: !8ball 질문")] });

    const answers = [
      "ㅇㅇ", "ㄴㄴ", "그럴듯", "애매함", "확실함", "다시 물어봐", "지금은 비추", "가자", "멈춰"
    ];
    const a = answers[Math.floor(Math.random() * answers.length)];
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`❓ ${q}\n🎱 **${a}**`)]
    });
  }

  if (cmd === "숫자게임") {
    const sub = (parts[0] || "").toLowerCase();
    const chId = msg.channel.id;

    if (sub === "시작") {
      if (numberGame.has(chId)) return msg.reply({ embeds: [errEmbed("이미 진행 중임.")] });

      const answer = Math.floor(Math.random() * 100) + 1;
      numberGame.set(chId, { answer, hostId: msg.author.id });

      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("🎮 숫자게임 시작!\n`!숫자 1~100` 으로 맞춰봐.")]
      });
    }

    if (sub === "종료") {
      const game = numberGame.get(chId);
      if (!game) return msg.reply({ embeds: [errEmbed("진행 중인 게임 없음.")] });

      // 관리자 or 시작한 사람만 종료
      if (!isAllowed(msg) && msg.author.id !== game.hostId) {
        return msg.reply({ embeds: [errEmbed("종료 권한 없음.")] });
      }

      numberGame.delete(chId);
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription("🛑 숫자게임 종료됨.")]
      });
    }

    return msg.reply({ embeds: [errEmbed("사용법: !숫자게임 시작 / !숫자게임 종료")] });
  }

  if (cmd === "숫자") {
    const chId = msg.channel.id;
    const game = numberGame.get(chId);
    if (!game) return;

    const n = parseInt(parts[0], 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) return;

    if (n === game.answer) {
      numberGame.delete(chId);
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`🎉 정답! **${n}**`) ]
      });
    }
    const hint = n < game.answer ? "UP ⬆️" : "DOWN ⬇️";
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(hint)] });
  }

  if (cmd === "수학퀴즈") {
    const chId = msg.channel.id;
    if (mathQuiz.has(chId)) return msg.reply({ embeds: [errEmbed("이미 퀴즈 진행 중임.")] });

    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ops = ["+", "-", "*"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let ans;
    if (op === "+") ans = a + b;
    if (op === "-") ans = a - b;
    if (op === "*") ans = a * b;

    const expiresAt = Date.now() + 10_000;
    mathQuiz.set(chId, { answer: ans, expiresAt });

    await msg.reply({
      embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🧠 수학퀴즈!\n**${a} ${op} ${b} = ?**\n10초 안에 \`!답 숫자\` 로 입력`)]
    });

    setTimeout(() => {
      const q = mathQuiz.get(chId);
      if (!q) return;
      if (Date.now() >= q.expiresAt) {
        mathQuiz.delete(chId);
        msg.channel.send({ embeds: [new EmbedBuilder().setColor(Colors.Orange).setDescription(`⏰ 시간끝! 정답: **${ans}**`)] }).catch(() => {});
      }
    }, 10_500);

    return;
  }

  if (cmd === "답") {
    const chId = msg.channel.id;
    const q = mathQuiz.get(chId);
    if (!q) return;

    if (Date.now() > q.expiresAt) {
      mathQuiz.delete(chId);
      return;
    }

    const n = parseInt(parts[0], 10);
    if (!Number.isFinite(n)) return;

    if (n === q.answer) {
      mathQuiz.delete(chId);
      return msg.reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription("✅ 정답!")] });
    } else {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ 땡")] });
    }
  }

  /* ===== 관리자 전용 ===== */
  if (cmd === "공지중지") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const st = processes.get(msg.guild.id);
    if (!st || !st.running) return msg.reply({ embeds: [errEmbed("진행 중인 공지 없음.")] });

    processes.set(msg.guild.id, { running: true, cancel: true });
    return msg.reply({ embeds: [new EmbedBuilder().setColor(Colors.Orange).setDescription("🛑 공지 전송 중지 요청됨.")] });
  }

  if (cmd === "공지") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const text = msg.content.slice((config.prefix + "공지").length).trim();
    const members = await listAllMembers(msg.guild);
    const users = normalizeUsersFromMembers(members);
    return runNotice(msg, users, text);
  }

  if (cmd === "공지역할") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const role = msg.mentions.roles.first();
    if (!role) return msg.reply({ embeds: [errEmbed("사용법: !공지역할 @역할 메시지")] });

    let text = msg.content.slice((config.prefix + "공지역할").length).trim();
    text = text.replace(/<@&\d+>/g, "").trim();

    const roleId = role.id;
    const members = await listAllMembers(msg.guild);
    const filtered = members.filter((m) => m.roles?.cache?.has(roleId));
    const users = normalizeUsersFromMembers(filtered);
    return runNotice(msg, users, text);
  }

  if (cmd === "공지선택") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const usersMentioned = msg.mentions.users;
    if (!usersMentioned.size) return msg.reply({ embeds: [errEmbed("사용법: !공지선택 @유저들 메시지")] });

    let text = msg.content.slice((config.prefix + "공지선택").length).trim();
    text = text.replace(/<@!?\d+>/g, "").trim();

    const users = [...new Map([...usersMentioned.values()].map((u) => [u.id, u])).values()];
    return runNotice(msg, users, text);
  }

  if (cmd === "상태변경") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const text = parts.join(" ").trim();
    if (!text) return msg.reply({ embeds: [errEmbed("사용법: !상태변경 내용")] });

    client.user.setPresence({
      activities: [{ name: text, type: ActivityType.Watching }],
      status: "online"
    });

    return msg.reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription("✅ 상태 변경 완료")] });
  }

  if (cmd === "청소") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const amount = parseInt(parts[0], 10);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100) {
      return msg.reply({ embeds: [errEmbed("사용법: !청소 1~100")] });
    }

    // 14일 지난 메시지는 삭제 안됨(디스코드 제한)
    await msg.channel.bulkDelete(amount, true).catch(() => {});
    return msg.channel.send({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🧹 ${amount}개 삭제 완료`)] })
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000))
      .catch(() => {});
  }

  if (cmd === "슬로우") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const sec = parseInt(parts[0], 10);
    if (!Number.isFinite(sec) || sec < 0 || sec > 21600) {
      return msg.reply({ embeds: [errEmbed("사용법: !슬로우 0~21600")] });
    }

    await msg.channel.setRateLimitPerUser(sec).catch(() => {});
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(`🐢 슬로우모드: **${sec}초**`)] });
  }

  if (cmd === "닉변경") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const member = msg.mentions.members.first();
    if (!member) return msg.reply({ embeds: [errEmbed("사용법: !닉변경 @유저 새닉")] });

    const newNick = parts.slice(1).join(" ").trim();
    if (!newNick) return msg.reply({ embeds: [errEmbed("새 닉네임을 입력해")] });

    await member.setNickname(newNick).catch(() => {});
    return msg.reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription("✅ 닉변경 완료")] });
  }

  if (cmd === "잠금" || cmd === "해제") {
    if (!isAllowed(msg)) return msg.reply({ embeds: [errEmbed("권한 없음")] });

    const everyone = msg.guild.roles.everyone;
    const lock = cmd === "잠금";

    await msg.channel.permissionOverwrites.edit(everyone, {
      SendMessages: lock ? false : null
    }).catch(() => {});

    return msg.reply({
      embeds: [new EmbedBuilder().setColor(lock ? Colors.Orange : Colors.Green).setDescription(lock ? "🔒 채널 잠금됨" : "🔓 채널 해제됨")]
    });
  }
});

/* ================= READY ================= */
client.once("clientReady", (c) => {
  console.log(`로그인됨: ${c.user.tag}`);

  c.user.setPresence({
    activities: [{ name: ".help", type: ActivityType.Watching }],
    status: "online"
  });

  setInterval(() => {
    try { writeStats(stats); } catch {}
  }, 15000);
});

client.login(config.token);