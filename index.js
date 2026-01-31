/**
 * [네이버 증권 고수 모니터링 봇 - 안티 크롤링 차단 회피 버전]
 */
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
const token = ''; // 여기에 토큰 입력
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
        const nextWait = Math.floor(Math.random() * (10000 - 2000 + 1) + 10000);
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

// 에러 핸들링
bot.on('polling_error', (e) => {
    if (e.code !== 'EFATAL' && e.code !== 'ECONNRESET') return;
    console.log(`📡 통신 상태 확인 중...`);
});

console.log("✅ 시스템 운영 준비 완료. 텔레그램 /on 명령어를 기다리는 중...");