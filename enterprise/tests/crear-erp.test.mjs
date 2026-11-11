import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {solicitudCrearERP,crearInventarioERP} from '../src/mysql/crear-desde-erp.mjs';
import {configuracionApi} from '../src/servir.mjs';
const solicitud=()=>({operacionId:randomUUID(),consultaId:randomUUID(),codigo:'101126_ALU',fechaInicio:'2026-11-10',fechaProgramada:'',responsable:'Operaciones',filasEsperadas:3,unidadesEsperadas:'1.300000000'});
test('crear ERP exige identificadores, nombre literal, fechas válidas y totales exactos; no admite stock ni clientes del navegador',()=>{
 const s=solicitud();assert.equal(solicitudCrearERP(s).fechaProgramada,null);
 for(const patch of [{filas:[]},{clienteId:randomUUID()},{sede:'UIO'},{codigo:'ALU'},{fechaInicio:'2026-02-30'},{filasEsperadas:0},{filasEsperadas:100001},{unidadesEsperadas:1.3},{unidadesEsperadas:'1,300'},{unidadesEsperadas:'-1.000000000'}])assert.throws(()=>solicitudCrearERP({...s,...patch}));
});
test('solicitud ERP inválida no adquiere conexión ni hace SQL',async()=>{
 let conexiones=0;await assert.rejects(crearInventarioERP({pool:{getConnection(){conexiones++;throw Error();}},principal:{actorId:randomUUID()},solicitud:{...solicitud(),password:'NO_ADMITIR'},obtenerVista(){throw Error();}}));assert.equal(conexiones,0);
});
test('creación ERP requiere habilitación separada de consulta y operación nativa',()=>{
 const env={IMS_API_HABILITADA:'1',IMS_HOST:'127.0.0.1',IMS_PORT:'3003',IMS_PUBLIC_URL:'https://apps.flexnetuio.com:8445',IMS_SOLO_LECTURA:'0',IMS_OPERACION_NATIVA:'1',IMS_ERP_HABILITADO:'1'};
 assert.equal(configuracionApi(env).erpCreacion,false);assert.equal(configuracionApi({...env,IMS_ERP_CREACION:'1'}).erpCreacion,true);
 assert.throws(()=>configuracionApi({...env,IMS_ERP_CREACION:'1',IMS_ERP_HABILITADO:'0'}));assert.throws(()=>configuracionApi({...env,IMS_ERP_CREACION:'true'}));
});
