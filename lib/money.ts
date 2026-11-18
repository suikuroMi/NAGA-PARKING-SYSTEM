export const centavos = (amount:number) => Math.round(amount * 100)
export const sumMoney = (amounts:number[]) => amounts.reduce((sum,value)=>sum+centavos(value),0)/100
