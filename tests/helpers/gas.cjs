const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../Cronograma_Recordatorios.js'),'utf8');
class Sheet {
  constructor(name,rows=[]){this.name=name;this.rows=structuredClone(rows);this.failWrite=false;this.failDelete=false;this.onRead=null;}
  getName(){return this.name}
  getLastRow(){let n=this.rows.length;while(n&&!this.rows[n-1].some(x=>x!==''&&x!=null))n--;return n}
  getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))}
  getMaxColumns(){return 100}
  clear(){this.rows=[];return this}
  appendRow(row){this.rows.push(structuredClone(row));return this}
  hideSheet(){} autoResizeColumns(){} setFrozenRows(){}
  deleteRows(start,n){if(this.failDelete)throw Error('injected delete failure');this.rows.splice(start-1,n)}
  getRange(row,col,n=1,m=1){
    const sheet=this;
    const range={
      getValues(){if(sheet.onRead)sheet.onRead();return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??''))},
      getDisplayValues(){return this.getValues().map(r=>r.map(String))},
      setValues(values){if(sheet.failWrite){sheet.failWrite=false;throw Error('injected write failure')};for(let i=0;i<n;i++){sheet.rows[row+i-1]??=[];for(let j=0;j<m;j++)sheet.rows[row+i-1][col+j-1]=values[i][j]}return this},
      clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(sheet.rows[row+i-1])sheet.rows[row+i-1][col+j-1]='';return this}
    };
    for(const method of ['setFontWeight','setBackground','setFontColor','setNumberFormat'])range[method]=()=>range;
    return range;
  }
}
function book(sheets){return {getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n)),getSpreadsheetTimeZone:()=> 'America/Guayaquil'}}
function context(){
  let now=1000;
  const props={};
  const p={getProperty:k=>props[k]??null,setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k],setProperties:o=>Object.assign(props,o)};
  const trigger={timeBased(){return this},everyMinutes(){return this},after(){return this},create(){}};
  const c=vm.createContext({console,Date,Logger:{log(){}},PropertiesService:{getScriptProperties:()=>p},Utilities:{getUuid:()=> 'test-run',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(require('node:crypto').createHash('sha256').update(s).digest())},ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>trigger},SpreadsheetApp:{flush(){},getActiveSpreadsheet:()=>null},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}});
  vm.runInContext(source,c);
  c.Date=class extends Date {static now(){return now}};
  return {c,props,setTime:v=>now=v};
}

module.exports={Sheet,book,context};
