export type CsvRow=(string|number)[]
export function csvText(rows:CsvRow[]) {
  return rows.map(row=>row.map(value=>`"${(typeof value==='string'&&/^[=+@\-\t\r]/.test(value)?"'"+value:String(value)).replace(/"/g,'""')}"`).join(',')).join('\r\n')
}
export function downloadCsv(name:string,rows:CsvRow[]) {
  const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}))
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
