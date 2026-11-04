import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const PARAMS={N:32768,r:8,p:1,maxmem:64*1024*1024};
export class ErrorAuth extends Error {
  constructor(codigo,mensaje,status=401){super(mensaje);this.name='ErrorAuth';this.codigo=codigo;this.status=status;}
}
export function correoCanonico(value){
  if(typeof value!=='string')throw new ErrorAuth('SOLICITUD_INVALIDA','Correo inválido.',400);
  const correo=value.trim().toLowerCase();
  if(correo.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(correo)||correo.indexOf('@')!==correo.lastIndexOf('@'))
    throw new ErrorAuth('SOLICITUD_INVALIDA','Correo inválido.',400);
  return correo;
}
function passwordValido(value){return typeof value==='string'&&value.length>0&&Buffer.byteLength(value,'utf8')<=1024;}
export async function crearHashPassword(password){
  if(!passwordValido(password)||[...password].length<12)
    throw new ErrorAuth('PASSWORD_INVALIDO','Las cuentas nuevas requieren al menos 12 caracteres.',400);
  const salt=randomBytes(16),hash=await scrypt(password,salt,32,PARAMS);
  return `scrypt$v1$32768$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export async function verificarPassword(password,stored){
  if(!passwordValido(password)||typeof stored!=='string')return false;
  const m=/^scrypt\$v1\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if(!m)return false;
  const actual=await scrypt(password,Buffer.from(m[1],'hex'),32,PARAMS);
  return timingSafeEqual(actual,Buffer.from(m[2],'hex'));
}
export function sha256(value){return createHash('sha256').update(value).digest('hex');}
export function tokenOpaco(){return randomBytes(32).toString('base64url');}
export function tokenValido(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);}
export function tokensIguales(a,b){return tokenValido(a)&&tokenValido(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
