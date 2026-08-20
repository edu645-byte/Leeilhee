// ==========================================================================
// 로컬 개발용 통합 서버 (server.js)
// ==========================================================================
// Node.js 내장 모듈만 사용하여 별도의 패키지 설치 없이 즉시 실행할 수 있습니다.
// .env 파일의 GEMINI_API_KEY를 읽어 로컬에서도 /api/analyze API를 완벽하게 지원합니다.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import analyzeHandler from './api/analyze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 기본 포트를 8000으로 설정 (기존에 접속하시던 주소와 통일)
const PORT = process.env.PORT || 8000;

// 1. .env 파일 자동 로드 함수
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...values] = trimmed.split('=');
                if (key && values.length > 0) {
                    process.env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
                }
            }
        });
        console.log('✅ [.env] 환경 변수 로드 완료');
    } else {
        console.warn('⚠️ [.env] 파일이 없습니다. 기본 환경 변수를 사용합니다.');
    }
}

loadEnv();

// 2. MIME 타입 정의
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 3. HTTP 서버 생성
const server = http.createServer(async (req, res) => {
    // CORS 헤더 설정 (로컬 개발 편의성)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // A. API 엔드포인트 라우팅 (/api/analyze)
    if (pathname === '/api/analyze' || pathname === '/api/analyze.js') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'POST 요청만 지원합니다.' }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const jsonBody = body ? JSON.parse(body) : {};
                
                // Vercel 핸들러 규격에 맞춘 Mock req/res 객체
                const mockReq = {
                    method: req.method,
                    body: jsonBody,
                    headers: req.headers
                };

                const mockRes = {
                    status: (statusCode) => {
                        res.statusCode = statusCode;
                        return mockRes;
                    },
                    json: (data) => {
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(JSON.stringify(data));
                        return mockRes;
                    }
                };

                await analyzeHandler(mockReq, mockRes);
            } catch (err) {
                console.error('API 요청 처리 에러:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '서버 내부 오류: ' + err.message }));
            }
        });
        return;
    }

    // B. 정적 파일 서빙 (index.html 등)
    let filePath = pathname === '/' ? path.join(__dirname, 'index.html') : path.join(__dirname, pathname);

    // 보안 검사 (디렉토리 이탈 방지)
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // 파일이 없으면 index.html로 fallback (SPA 라우팅 지원)
                fs.readFile(path.join(__dirname, 'index.html'), (fallbackErr, fallbackContent) => {
                    if (fallbackErr) {
                        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('404 Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(fallbackContent);
                    }
                });
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`서버 오류: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

// 4. 서버 시작
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 [로컬 개발 서버 실행 중]`);
    console.log(`👉 접속 주소: http://localhost:${PORT}`);
    console.log(`👉 API 주소 : http://localhost:${PORT}/api/analyze`);
    console.log(`==================================================\n`);
});
