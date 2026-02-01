/**
 * [네이버 증권 고수 모니터링 봇 - 안티 크롤링 차단 회피 버전]
 */
require('dotenv').config(); // <--- 이 줄을 맨 위에 추가하세요!
const https = require('https');

// 1. 시스템 설정
process.env.NTBA_FIX_319 = 1;
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 2. 설정 값
const token = process.env.TELEGRAM_TOKEN; // 수정됨
const USER_MAP = {
    '28660113375981590': '길40',
    '28660300270188259': '네2버',
    '28660365766052776': '발바닥타짜',
    '28660366417418409': '롱브레스',
    '28660212081723429': '하버드수학과차트쟁이'
};

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

const TARGET_USER_IDS = Object.keys(USER_MAP);
let lastPostIds = {};
let isMonitoring = false;
let targetChatId = null; // 상단 변수 선언부에 추가

// 3. 봇 객체 생성 (이 부분을 아래와 같이 수정하세요)
const bot = new TelegramBot(token, {
    polling: {
        autoStart: true,
        params: {
            timeout: 10 // 폴링 타임아웃을 10초로 설정
        }
    },
    request: {
        agentOptions: {
            family: 4,           // 반드시 IPv4만 사용하도록 강제
            keepAlive: true      // 연결 유지 (서버 안정성 향상)
        }
    }
});
/**
 * 4. 유틸리티 함수
 */
// 무작위 지연 (ms)
const sleep = (min, max) => new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1) + min)));

// 데이터 수집 함수
async function fetchUserPost(profileId) {
    const url = `https://m.stock.naver.com/front-api/profile/user/discussionList`;
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
        const response = await axios.get(url, {
            params: { profileId, pageSize: 2, _t: Date.now() },
            headers: {
                'User-Agent': randomUA,
                'Referer': `https://m.stock.naver.com/profile/${profileId}`,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
                'Origin': 'https://m.stock.naver.com'
            },
            timeout: 10000
        });
        return response.data?.result?.posts?.[0] || null;
    } catch (e) {
        console.error(`❌ [${USER_MAP[profileId]}] 호출 에러: ${e.code || 'UNKNOWN'}`);
        return null;
    }
}

// 메시지 전송 함수
function sendPostMessage(chatId, post, profileId, label) {
    const nickname = USER_MAP[profileId] || post.nickname || "고수";
    const item = post.item || {};
    const stockType = item.discussionType === 'worldStock' ? 'world/stock' : 'domestic/stock';
    const postLink = `https://m.stock.naver.com/${stockType}/${item.itemCode}/discussion/${post.postId}?from=profile`;
    
    const content = (post.contentSwReplaced || post.title || "")
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ")
        .trim();
    
    const summary = content.substring(0, 300);

    const message = `[${label}]\n\n` +
                    `👤 **작성자**: ${nickname}\n` +
                    `🏢 **종목**: ${item.itemName} (${item.itemCode})\n` +
                    `📝 **제목**: ${post.title}\n` +
                    `------------------------------------------\n` +
                    `${summary}${content.length > 300 ? '...' : ''}\n\n` +
                    `🔗 [원문 보기](${postLink})`;

    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: false 
    }).catch(() => {});
}

/**
 * 5. 메인 감시 루프
 */
async function checkLoop(chatId) {
    if (!isMonitoring) return;

    console.log(`\n[${new Date().toLocaleTimeString()}] 순회 시작...`);

    for (const profileId of TARGET_USER_IDS) {
        if (!isMonitoring) break;

        const post = await fetchUserPost(profileId);
        
        if (post && post.postId) {
            const currentId = String(post.postId);
            
            if (!lastPostIds[profileId]) {
                lastPostIds[profileId] = currentId;
                sendPostMessage(chatId, post, profileId, "✅ 모니터링 연결");
            } else if (lastPostIds[profileId] !== currentId) {
                lastPostIds[profileId] = currentId;
                sendPostMessage(chatId, post, profileId, "🔔 새 글 알림");
                console.log(`✨ [${USER_MAP[profileId]}] 새 글 발견!`);
            }
        }

        // 유저 간 요청 간격: 3초 ~ 6초 사이 무작위 (사람처럼 보이게)
        await sleep(3000, 6000);
    }
    
    if (isMonitoring) {
        // 전체 한 바퀴 돈 후 대기 시간: 20초 ~ 40초 사이 무작위
        // 너무 짧으면 네이버에서 패턴을 파악하여 차단할 수 있음
        const nextWait = Math.floor(Math.random() * (2000 + 1) + 3000);
        console.log(`[대기] 다음 순회까지 ${nextWait/1000}초 휴식...`);
        setTimeout(() => checkLoop(chatId), nextWait); 
    }
}

/**
 * 6. 명령어 처리
 */
bot.onText(/\/on/, (msg) => {
    if (isMonitoring) {
        bot.sendMessage(msg.chat.id, "이미 가동 중입니다.");
        return;
    }
    isMonitoring = true;
    lastPostIds = {};
    bot.sendMessage(msg.chat.id, "🚀 **네이버 고수 모니터링 시작**\n(우회 설정 적용 완료)");
    checkLoop(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    isMonitoring = false;
    bot.sendMessage(msg.chat.id, "🛑 모니터링을 종료합니다.");
});

bot.onText(/\/clear/, (msg) => {
    // 1. 메모리에 저장된 마지막 게시글 ID 정보 삭제
    lastPostIds = {}; 
    
    // 2. 혹시 모를 대기 중인 루프와의 충돌 방지를 위해 상태 알림
    bot.sendMessage(msg.chat.id, "🧹 **데이터 초기화 완료**\n이전 게시글 기록을 모두 지웠습니다. 다시 처음부터 감시를 시작합니다.");
    
    console.log(`[${new Date().toLocaleTimeString()}] 사용자에 의해 데이터가 초기화되었습니다.`);
});

// --- [명령어: /help] ---
bot.onText(/\/help/, (msg) => {
    const helpMsg = `
🚀 **네이버 고수 모니터링 봇 안내**

✅ **기본 명령어**
• \`/on\` : 실시간 감시 시작 (우회 모드)
• \`/off\` : 모든 모니터링 중지
• \`/clear\` : 수동 기록 초기화 (중복 방지 해제)
• \`/help\` : 도움말 보기

💡 **알림 주기 및 설정**
• 유저별로 약 5초 간격으로 사람처럼 순회합니다.
• 🕒 **자동 초기화**: 3시간마다 시스템이 감시 기록을 비워, 수정된 글이나 다시 올라온 글을 놓치지 않도록 합니다.
    `;
    bot.sendMessage(msg.chat.id, helpMsg, { parse_mode: 'Markdown' });
});

// 에러 핸들링
bot.on('polling_error', (e) => {
    if (e.code !== 'EFATAL' && e.code !== 'ECONNRESET') return;
    console.log(`📡 통신 상태 확인 중...`);
});

/**
 * 7. 자동 초기화 스케줄러 (3시간 마다)
 */
const THREE_HOURS = 3 * 60 * 60 * 1000; 

setInterval(() => {
    if (isMonitoring && targetChatId) {
        lastPostIds = {}; // 기록 초기화
        console.log(`[${new Date().toLocaleTimeString()}] 🕒 3시간 주기 자동 데이터 초기화 완료`);
        
        // 사용자에게 초기화 알림 (원치 않으시면 이 줄만 지우세요)
        bot.sendMessage(targetChatId, "🕒 **정기 데이터 초기화 완료**\n원활한 감시를 위해 최근 기록을 비웠습니다. 지금부터 올라오는 글은 다시 새 글 처리됩니다.");
    }
}, THREE_HOURS);


console.log("✅ 시스템 운영 준비 완료. 텔레그램 /on 명령어를 기다리는 중...");