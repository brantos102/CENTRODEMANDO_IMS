import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estadoPermiteConsolidar} from '../src/dominio/inventario.mjs';
test('solo Entregado se publica; validación y negaciones permanecen guardadas fuera de KPI',()=>{
 for(const value of ['Entregado','ENTREGADO',' entregado '])assert.equal(estadoPermiteConsolidar(value),true);
 for(const value of ['En Proceso','En validación','No entregado','Entregado pendiente de validación','No ENTREGADO',null,undefined,''])assert.equal(estadoPermiteConsolidar(value),false);
});
test('archivar o consultar no reescribe estado ni datos del inventario',()=>{
 const item={codigo:'250724_IBM',estado:'En validación',archivado:false,lineas:[{sku:'0001',cantidad:'0'}]};const before=structuredClone(item);
 assert.equal(estadoPermiteConsolidar(item.estado),false);assert.deepEqual(item,before);
 const aprobado={...item,estado:'Entregado',archivado:true};assert.equal(estadoPermiteConsolidar(aprobado.estado),true);
});
