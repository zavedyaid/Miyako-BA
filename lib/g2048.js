/*
 * Mesin 2048 deterministik — SATU sumber untuk game di sheet (HTML) dan verifikasi di bot.
 * Seed dari bot → urutan ubin acak sama persis → bot memutar ulang langkah pemain dari kode klaim dan
 * menghitung skor sendiri (tidak percaya skor dari klien). Kode: <seed36>.<jumlahLangkah36>.<langkah 2-bit base64url>
 */
export const ENGINE_SRC = `(function(){
function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function spawn(s){var e=[];for(var i=0;i<16;i++)if(!s.b[i])e.push(i);if(!e.length)return;var k=e[Math.floor(s.r()*e.length)];s.b[k]=s.r()<0.9?1:2}
function create(seed){var s={b:new Array(16).fill(0),score:0,r:rng(seed),n:0};spawn(s);spawn(s);return s}
function line(a){var f=a.filter(function(x){return x}),o=[],sc=0;for(var i=0;i<f.length;i++){if(f[i]===f[i+1]){o.push(f[i]+1);sc+=Math.pow(2,f[i]+1);i++}else o.push(f[i])}while(o.length<4)o.push(0);return[o,sc]}
function move(s,d){var ch=false,add=0,nb=s.b.slice();
for(var k=0;k<4;k++){var idx=[];for(var j=0;j<4;j++)idx.push(d===0?j*4+k:d===2?(3-j)*4+k:d===3?k*4+j:k*4+(3-j));
var r=line(idx.map(function(i){return s.b[i]}));add+=r[1];for(var j2=0;j2<4;j2++){if(nb[idx[j2]]!==r[0][j2]){ch=true;nb[idx[j2]]=r[0][j2]}}}
if(!ch)return false;s.b=nb;s.score+=add;s.n++;spawn(s);return true}
function over(s){if(s.b.indexOf(0)>=0)return false;for(var i=0;i<16;i++){var x=i%4,y=i>>2;if(x<3&&s.b[i]===s.b[i+1])return false;if(y<3&&s.b[i]===s.b[i+4])return false}return true}
function enc(seed,mv){var by=[];for(var i=0;i<mv.length;i+=4){var v=0;for(var j=0;j<4;j++)v|=((mv[i+j]||0)&3)<<(j*2);by.push(v)}
var bin='';for(var q=0;q<by.length;q++)bin+=String.fromCharCode(by[q]);
return (seed>>>0).toString(36)+'.'+mv.length.toString(36)+'.'+btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}
function dec(code){var p=String(code||'').trim().split('.');if(p.length!==3)return null;var seed=parseInt(p[0],36),n=parseInt(p[1],36);if(!(seed>=0)||!(n>=0)||n>6000)return null;
var b64=p[2].replace(/-/g,'+').replace(/_/g,'/');while(b64.length%4)b64+='=';var bin;try{bin=atob(b64)}catch(e){return null}
if(bin.length!==Math.ceil(n/4))return null;var mv=[];for(var i=0;i<n;i++)mv.push((bin.charCodeAt(i>>2)>>((i&3)*2))&3);return{seed:seed,moves:mv}}
return{create:create,move:move,over:over,enc:enc,dec:dec}})()`;

const E = (0, eval)(ENGINE_SRC);

export const newSeed = () => (Math.random() * 0xffffffff) >>> 0;
export const decode = (code) => E.dec(code);

// Putar ulang permainan → { ok, score, moves, over } atau { ok:false }
export const replay = (seed, moves) => {
  const s = E.create(seed);
  for (const m of moves) {
    if (E.over(s) || !E.move(s, m)) return { ok: false };
  }
  return { ok: true, score: s.score, moves: s.n, over: E.over(s), best: Math.max(...s.b) };
};

// Hadiah dari skor: 1 Gold per 12 poin (maks 300) + 1 XP per 50 poin (maks 80). Skor < MIN_SCORE tidak dapat hadiah.
export const MIN_SCORE = 300;
export const DAILY_CLAIMS = 3;
export const rewardFor = (score) => ({ gold: Math.min(300, Math.floor(score / 12)), xp: Math.min(80, Math.floor(score / 50)) });
