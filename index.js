/**
 * [네이버 증권 고수 모니터링 봇 - 오라클 클라우드 최종 최적화]
 */

// 1. 네트워크 및 시스템 설정 (최상단)
process.env.NTBA_FIX_319 = 1; 
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first'); 
}

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// 2. 봇 설정 (새 토큰 반영)
const token = '';

// 오라클 클라우드의 불안정한 연결을 잡기 위한 특수 옵션
const bot = new TelegramBot(token, { 
    polling: { 
        autoStart: true,
        params: { 
            family: 4,
            timeout: 50 // 타임아웃 연장
        }
    }
});

/**
 * 3. 유저 매핑 설정
 */
const USER_MAP = {
    '28660113375981590': '길40',
    '28660300270188259': '네2버', 
    '28658691976131524': 'King',    
    '28660366417418409': '롱브레스',
    '28660113467999165': '일당500',
    '28658416754740360': '대한민국NO1',
    '28660212081723429': '하버드수학과차트쟁이'
};

const TARGET_USER_IDS = Object.keys(USER_MAP);
let lastPostIds = {};
let isMonitoring = false;

// 4. 네이버 데이터 수집 함수 (타임아웃 강화)
async function fetchUserPost(profileId) {
    const url = `https://m.stock.naver.com/front-api/profile/user/discussionList`;
    try {
        const response = await axios.get(url, {
            params: { profileId, pageSize: 2, _t: Date.now() },
            headers: { 
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
                'Referer': `https://m.stock.naver.com/profile/${profileId}`
            },
            timeout: 15000 // 네이버 응답 대기 시간 증가
        });
        return response.data?.result?.posts?.[0] || null;
    } catch (e) {
        return null; 
    }
}

// 5. 메시지 전송 함수 (Markdown 적용)
function sendPostMessage(chatId, post, profileId, label) {
    const nickname = USER_MAP[profileId] || post.nickname || "고수";
    const item = post.item || {};
    const stockType = item.discussionType === 'worldStock' ? 'world/stock' : 'domestic/stock';
    const postLink = `https://m.stock.naver.com/${stockType}/${item.itemCode}/discussion/${post.postId}?from=profile`;
    
    const content = (post.contentSwReplaced || post.title || "")
        .replace(/<[^>]*>?/gm, "")
        .replace(/&nbsp;/g, " ")
        .trim();
    
    const summary = content.substring(0, 350);

    const message = `[${label}]\n\n` +
                    `👤 **작성자**: ${nickname}\n` +
                    `🏢 **종목**: ${item.itemName} (${item.itemCode})\n` +
                    `📝 **제목**: ${post.title}\n` +
                    `------------------------------------------\n` +
                    `${summary}${content.length > 350 ? '...' : ''}\n\n` +
                    `🔗 [원문 보기](${postLink})`;

    bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: false 
    }).catch(e => {}); // 전송 실패 시 무시
}

// 6. 감시 루프
async function checkLoop(chatId) {
    if (!isMonitoring) return;

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
                console.log(`✨ [${USER_MAP[profileId]}] 새 알림 전송`);
            }
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    
    if (isMonitoring) {
        setTimeout(() => checkLoop(chatId), 35000); 
    }
}

// 7. 명령어 처리
bot.onText(/\/on/, (msg) => {
    if (isMonitoring) return;
    isMonitoring = true;
    lastPostIds = {};
    bot.sendMessage(msg.chat.id, "🚀 **모니터링 시작!** 새 토큰과 최적화 설정이 적용되었습니다.");
    checkLoop(msg.chat.id);
});

bot.onText(/\/off/, (msg) => {
    isMonitoring = false;
    bot.sendMessage(msg.chat.id, "🛑 모니터링을 종료합니다.");
});

// 8. 에러 핸들링 (로그 도배 방지)
bot.on('polling_error', (error) => {
    // 단순 연결 지연은 로그에 찍지 않음 (성능 최적화)
    if (error.code !== 'EFATAL' && error.code !== 'ECONNRESET') {
        console.log(`📡 상태: ${error.code}`);
    }
});

console.log("✅ [시스템 운영 중] 텔레그램에서 /on 을 입력하면 감시가 시작됩니다.");
