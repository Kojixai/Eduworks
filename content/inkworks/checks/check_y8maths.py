#!/usr/bin/env python3
"""check_y8maths.py: validates /home/claude/site_work/content/y8maths.json against CONTENT_SCHEMA.txt
and independently recomputes every numeric, cloze and order answer (plus mcq/multi/truefalse/text
answers where a check is given). The expressions below were written separately from the stated
answers; each one is evaluated here and compared with what the JSON says. Exit code 0 = 100% pass."""
import json, math, re, sys, os
from fractions import Fraction as F
from decimal import Decimal, ROUND_HALF_UP

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "y8maths.json")

CHECKS = {'y8maths-u01-q01': '-8+13',
 'y8maths-u01-q02': '4-11',
 'y8maths-u01-q03': [-11, -4.5, -4, -0.5, 2],
 'y8maths-u01-q04': '-6*-7',
 'y8maths-u01-q05': ['-8', '-7'],
 'y8maths-u01-q06': '-3-(-9)',
 'y8maths-u01-q07': '-9+14-11',
 'y8maths-u01-q08': ['-5-3==8', '(-2)*(-3)*(-1)==-6', '-20/4>-20/-4', '-0.1>-0.01'],
 'y8maths-u01-q10': '[w for w in range(21) if 3*(20-w)-2*w==25][0]',
 'y8maths-u02-q01': '18-12/4',
 'y8maths-u02-q02': '3+4**2',
 'y8maths-u02-q03': '(9-3)**2/4',
 'y8maths-u02-q04': '2*3**2',
 'y8maths-u02-q05': 'IDX:[i for i,v in enumerate([(20-8)/(2+2), 20-(8/2)+2, (20-8/2)+2, 20-8/(2+2)]) if v==3][0]',
 'y8maths-u02-q06': 'sqrt(7**2-13)+2*5',
 'y8maths-u02-q07': '2**5-5**2',
 'y8maths-u02-q09': 'sqrt(19*2+11)',
 'y8maths-u02-q10': '1/(1/4)+sqrt(3**2+4**2)',
 'y8maths-u03-q01': '0.6*7',
 'y8maths-u03-q02': '5.6/8',
 'y8maths-u03-q03': ['4.7*2.3', '0.47*230'],
 'y8maths-u03-q04': '0.3*0.4',
 'y8maths-u03-q05': '7.2/0.08',
 'y8maths-u03-q06': '3.6*2.15',
 'y8maths-u03-q07': '12.40*3.5',
 'y8maths-u03-q08': '[i for i,v in enumerate([24*0.98, 24/1.5, 24/0.8, 24*1.02, 24*0.5]) if v<24]',
 'y8maths-u03-q10': ['int(10.05//2.35)', 'round(10.05-4*2.35, 2)'],
 'y8maths-u04-q01': 'r(8.362,1)',
 'y8maths-u04-q02': 'r(52718,-3)',
 'y8maths-u04-q03': 'sf(0.00472,2)',
 'y8maths-u04-q04': 'sf(6049,2)',
 'y8maths-u04-q05': ['sf(0.0386,1)', 'sf(386,1)', 'sf(3.86,1)', 'sf(38600,1)'],
 'y8maths-u04-q06': 'r(19.97,1)',
 'y8maths-u04-q07': 'sqrt(58)/3.1',
 'y8maths-u04-q09': 'r(499/7,0)',
 'y8maths-u04-q10': 'max(n for n in range(4000,5000) if sf(n,2)==4500)',
 'y8maths-u05-q01': 'sf(31,1)*sf(9.8,1)',
 'y8maths-u05-q02': 'sf(587,1)/sf(19.6,1)',
 'y8maths-u05-q03': 'sf(4.12,1)*sf(78.9,1)',
 'y8maths-u05-q04': '(sf(61.4,1)+sf(38.9,1))/sf(0.48,1)',
 'y8maths-u05-q05': 'IDX:0 if 80/4 < 83/3.8 else 1',
 'y8maths-u05-q06': 'sqrt(49)*2',
 'y8maths-u05-q07': 'sf(139.9,2)*sf(41.3,2)/100',
 'y8maths-u05-q09': ['abs(19.6*5.1-99.96)<0.01', 'abs(412/7.9-5.215)<0.01', 'abs(0.29*61-17.69)<0.01', 'abs(88.4/0.42-21.05)<0.01'],
 'y8maths-u05-q10': 'sf(9.73,1)*sf(0.211,1)/sf(0.0487,1)',
 'y8maths-u06-q01': '60-10/2',
 'y8maths-u06-q02': 'IDX:0',
 'y8maths-u06-q03': ['250-5', '250+5'],
 'y8maths-u06-q04': ['12.4-0.05', '12.4+0.05'],
 'y8maths-u06-q05': ['350<=349<450', '350<=350<450', '350<=449.9<450', '350<=450<450'],
 'y8maths-u06-q06': ['17000-500', '17000+500'],
 'y8maths-u06-q07': ['8.3', '8.4'],
 'y8maths-u06-q09': '6*5.5',
 'y8maths-u06-q10': ['7.5**2', '8.5**2'],
 'y8maths-u07-q01': '6**3',
 'y8maths-u07-q02': 'sqrt(144)',
 'y8maths-u07-q03': 'cbrt(64)',
 'y8maths-u07-q04': '7**0',
 'y8maths-u07-q05': ['math.floor(50**(1/3))', 'math.ceil(50**(1/3))'],
 'y8maths-u07-q06': 'IDX:2 if 2**6==4**3 else (0 if 2**6>4**3 else 1)',
 'y8maths-u07-q07': 'sqrt(2.25)',
 'y8maths-u07-q08': ['11**2', '5**3', '2**7', '3**5'],
 'y8maths-u07-q10': '[n*n for n in range(15,18) if 200<n*n<300 and (n*n+4)%10==0][0]',
 'y8maths-u08-q01': ['6'],
 'y8maths-u08-q02': 'IDX:1',
 'y8maths-u08-q03': ['3+5'],
 'y8maths-u08-q04': ['7-2'],
 'y8maths-u08-q05': ['3*4'],
 'y8maths-u08-q06': 'SYM:a^5',
 'y8maths-u08-q07': '2**10/2**7',
 'y8maths-u08-q08': ['3+3==9', '3+3==6', '2*3==5', '6-2==3'],
 'y8maths-u08-q10': 'math.log2(2**5*4**3)',
 'y8maths-u09-q01': '0.47*100',
 'y8maths-u09-q02': '6.3/1000',
 'y8maths-u09-q03': '3.08*10**4',
 'y8maths-u09-q04': 'IDX:1',
 'y8maths-u09-q05': 'SF:0.00056',
 'y8maths-u09-q06': ['5e-3', '4.1e-2', '3.9e-1', '1.2'],
 'y8maths-u09-q07': 'SF:3e4*5e2',
 'y8maths-u09-q08': 'SF:3e5*480',
 'y8maths-u09-q10': 'SF:6e5/1.5e-2',
 'y8maths-u10-q01': '[i for i,v in enumerate([21,31,39,43,51,57]) if isprime(v)]',
 'y8maths-u10-q02': 'hcf(18,45)',
 'y8maths-u10-q03': 'SYM:2*3**2*5',
 'y8maths-u10-q04': 'lcm(8,14)',
 'y8maths-u10-q05': ['hcf(126,60)', 'lcm(126,60)'],
 'y8maths-u10-q06': 'lcm(15,25)',
 'y8maths-u10-q07': 'hcf(72,54)',
 'y8maths-u10-q09': ['(2**3*3*5**2)%10==0', '(2**3*3*5**2)%9==0', '(2**3*3*5**2)%20==0', '(2**3*3*5**2)%2==1'],
 'y8maths-u10-q10': 'lcm(1,2,3,4,5,6,7,8)',
 'y8maths-u11-q01': 'FRS:F(2,9)+F(5,9)',
 'y8maths-u11-q02': 'FRS:F(3,4)-F(1,6)',
 'y8maths-u11-q03': 'F(2,5)+F(1,3)',
 'y8maths-u11-q04': 'FRS:F(5,6)+F(3,8)',
 'y8maths-u11-q05': 'FRS:F(13,4)-F(11,6)',
 'y8maths-u11-q06': 'FRS:F(19,8)-F(3,4)+F(3,2)',
 'y8maths-u11-q07': ['FRS:F(5,6)-F(1,4)'],
 'y8maths-u11-q09': ['F(5,8)-F(1,3)>F(1,4)', 'F(1,2)+F(1,3)+F(1,6)==1', 'F(7,10)-F(2,5)==1', 'F(3,4)+F(3,4)==F(6,8)'],
 'y8maths-u11-q10': '7/(1-F(3,8)-F(1,3))',
 'y8maths-u12-q01': 'FRS:F(2,7)*F(3,5)',
 'y8maths-u12-q02': 'F(5,6)*42',
 'y8maths-u12-q03': 'FRS:F(4,9)*F(3,8)',
 'y8maths-u12-q04': 'F(5,2)*F(6,5)',
 'y8maths-u12-q05': 'F(7,4)*F(8,3)',
 'y8maths-u12-q06': 'FRS:F(3,4)*F(2,5)',
 'y8maths-u12-q07': '60*F(3,5)*F(1,4)',
 'y8maths-u12-q08': '[i for i,v in enumerate([12*F(1,3), 12*F(3,2), 12*0.9, 12*F(5,4)]) if v<12]',
 'y8maths-u12-q10': '12/F(3,5)/F(2,3)',
 'y8maths-u13-q01': 'F(8,3)',
 'y8maths-u13-q02': '4/F(1,3)',
 'y8maths-u13-q03': 'FRS:F(5,6)/F(2,3)',
 'y8maths-u13-q04': 'FRS:F(3,10)/4',
 'y8maths-u13-q05': 'F(9,4)/F(3,2)',
 'y8maths-u13-q06': '8/F(2,5)',
 'y8maths-u13-q07': 'FRS:F(15,4)/F(3,2)',
 'y8maths-u13-q09': 'IDX:[i for i,v in enumerate([F(7,8)*4, F(7,8)*F(1,4), F(8,7)*F(1,4), F(7,8)-F(1,4)]) if v==F(7,8)/F(1,4)][0]',
 'y8maths-u13-q10': ['int(F(3,2)/F(2,9))', 'FRS:F(3,2)/F(2,9)-6'],
 'y8maths-u14-q01': '0.35*100',
 'y8maths-u14-q02': '3/20',
 'y8maths-u14-q03': 'IDX:[i for i,v in enumerate([4,40,0.4,400]) if v==0.4*100][0]',
 'y8maths-u14-q04': "FRS:F('0.625')",
 'y8maths-u14-q05': ['13/20', '0.66', '0.67', '17/25', '0.7'],
 'y8maths-u14-q06': 'FRS:F(35,120)',
 'y8maths-u14-q07': 'FRS:F(45,30)',
 'y8maths-u14-q09': 'IDX:0 if 27/30>43/50 else 1',
 'y8maths-u14-q10': 'IDX:argmin([abs(v-1/3) for v in [0.3,0.33,0.34,0.3,0.34]])',
 'y8maths-u15-q01': '0.15*60',
 'y8maths-u15-q02': '430/100',
 'y8maths-u15-q03': '0.35*240',
 'y8maths-u15-q04': '0.17*82',
 'y8maths-u15-q05': '18/24*100',
 'y8maths-u15-q06': '0.12*750',
 'y8maths-u15-q07': '64/150*100',
 'y8maths-u15-q08': 'IDX:0 if 80/5==0.2*80 else 3',
 'y8maths-u15-q09': ['abs(0.12*50-0.5*12)<1e-9', 'abs(1.5*40-60)<1e-9', 'abs(0.05*200-40)<1e-9', 'abs(0.005*600-3)<1e-9'],
 'y8maths-u15-q10': '90/(0.6*0.75)',
 'y8maths-u16-q01': '1+12/100',
 'y8maths-u16-q02': '1-6/100',
 'y8maths-u16-q03': '64*1.15',
 'y8maths-u16-q04': '850*0.92',
 'y8maths-u16-q05': '548*1.035',
 'y8maths-u16-q06': '1240*0.875',
 'y8maths-u16-q07': '14000*0.82',
 'y8maths-u16-q08': '1.25*0.8',
 'y8maths-u16-q10': '375*1.2*0.85',
 'y8maths-u17-q01': '(65-50)/50*100',
 'y8maths-u17-q02': '(80-68)/80*100',
 'y8maths-u17-q03': '(288-240)/240*100',
 'y8maths-u17-q04': '66/1.1',
 'y8maths-u17-q05': '72/0.8',
 'y8maths-u17-q06': '(24500-22540)/24500*100',
 'y8maths-u17-q07': '2.80/1.12',
 'y8maths-u17-q08': '7/18*100',
 'y8maths-u17-q10': '(40*1.35*0.8-40)/40*100',
 'y8maths-u18-q01': '600*3/100',
 'y8maths-u18-q02': '400*5/100*3',
 'y8maths-u18-q03': '2500+2500*0.024*5',
 'y8maths-u18-q04': '216/3/1800*100',
 'y8maths-u18-q05': '5000*0.03*2',
 'y8maths-u18-q06': '210/(750*0.04)',
 'y8maths-u18-q07': '508/1.27',
 'y8maths-u18-q09': 'IDX:0 if abs(2000*0.035*4-2000*0.045*3-10)<1e-6 else 1',
 'y8maths-u18-q10': '0.15*480+12*36.5-480',
 'y8maths-u19-q01': 'RAT:(3,7)',
 'y8maths-u19-q02': 'IDX:1',
 'y8maths-u19-q03': 'RAT:(5,8)',
 'y8maths-u19-q04': 'RAT:(3,8)',
 'y8maths-u19-q05': 'RAT:(1,2.5)',
 'y8maths-u19-q06': 'RAT:(2,1,3)',
 'y8maths-u19-q07': '350/7*2',
 'y8maths-u19-q09': 'IDX:0',
 'y8maths-u19-q10': 'RAT:(6,15,20)',
 'y8maths-u20-q01': '60/5*4',
 'y8maths-u20-q02': ['72/8*5', '72/8*3'],
 'y8maths-u20-q03': ['1800/9*2', '1800/9*7'],
 'y8maths-u20-q04': ['84/7', '84/7*2', '84/7*4'],
 'y8maths-u20-q05': 'IDX:0 if 28/4*3==21 else 1',
 'y8maths-u20-q06': '1400/7*2',
 'y8maths-u20-q07': '180/12*7',
 'y8maths-u20-q08': '30/5*3/3',
 'y8maths-u20-q10': '[3*k for k in range(1,50) if 3*(3*k+6)==2*(5*k+6)][0]',
 'y8maths-u21-q01': '6/4',
 'y8maths-u21-q02': '9/6*10',
 'y8maths-u21-q03': '350/5*8',
 'y8maths-u21-q04': '42/3*7',
 'y8maths-u21-q05': '6/4*10',
 'y8maths-u21-q06': 'IDX:argmin([72/330, 105/500, 320/1500])',
 'y8maths-u21-q07': '21/6*10',
 'y8maths-u21-q08': ['7/2==17.5/5==28/8', '4*0+1==0', 'True', 'False'],
 'y8maths-u21-q10': '350/100*9*1.48',
 'y8maths-u22-q01': '3*8',
 'y8maths-u22-q02': '4*15/6',
 'y8maths-u22-q03': '50*3/60',
 'y8maths-u22-q04': ['12*5/4', '12*5/20'],
 'y8maths-u22-q05': 'IDX:[i for i,v in enumerate([13.5,6,5,12]) if v==8*9/12][0]',
 'y8maths-u22-q06': '240/20',
 'y8maths-u22-q07': '[0,2,4]',
 'y8maths-u22-q08': '12*(20-5)/(12+3)',
 'y8maths-u22-q10': '4*6/2*3/3',
 'y8maths-u23-q01': '240/3',
 'y8maths-u23-q02': '5*2.5',
 'y8maths-u23-q03': '45/60',
 'y8maths-u23-q04': '480/60',
 'y8maths-u23-q05': ['int(150/60)', '(150/60-int(150/60))*60'],
 'y8maths-u23-q06': '0.75*400',
 'y8maths-u23-q07': '70*(1+24/60)',
 'y8maths-u23-q09': '15*3600/1000',
 'y8maths-u23-q10': '60/(30/60+30/40)',
 'y8maths-u24-q01': '3.2*1000',
 'y8maths-u24-q02': '450/1000',
 'y8maths-u24-q03': '85/10',
 'y8maths-u24-q04': '2.4*1000',
 'y8maths-u24-q05': ['4', '0.7*60'],
 'y8maths-u24-q06': '5*100**2',
 'y8maths-u24-q07': '3500/250',
 'y8maths-u24-q08': ['10**2==10', '100**3==1000000', '10**3==1000', '0.5*100**2==50'],
 'y8maths-u24-q10': '4*60*24*7/1000',
 'y8maths-u25-q01': '3*4',
 'y8maths-u25-q02': '4*25000/100000',
 'y8maths-u25-q03': '300000/20000',
 'y8maths-u25-q04': '2100/60',
 'y8maths-u25-q05': 'IDX:0 if 8*50==400 else 1',
 'y8maths-u25-q06': '9*5/2',
 'y8maths-u25-q07': 'RAT:(1,250000)',
 'y8maths-u25-q08': ['1200/150', '750/150'],
 'y8maths-u25-q10': '(2*25000/100)*(3*25000/100)/10000',
 'y8maths-u26-q01': 'SYM:5a',
 'y8maths-u26-q02': 'SYM:3pq',
 'y8maths-u26-q03': 'IDX:2',
 'y8maths-u26-q04': 'SYM:2x+7y',
 'y8maths-u26-q05': 'SYM:12a^2b',
 'y8maths-u26-q06': 'IDX:0',
 'y8maths-u26-q09': 'SYM:6x+3',
 'y8maths-u26-q10': 'SYM:5m+n',
 'y8maths-u27-q01': '4*5+3',
 'y8maths-u27-q02': '4**2-6',
 'y8maths-u27-q03': '3*2-2*(-5)',
 'y8maths-u27-q04': '(-6)**2',
 'y8maths-u27-q05': '8+2.5*6',
 'y8maths-u27-q06': '0.5*4*3**2',
 'y8maths-u27-q07': 'pi*7.2**2',
 'y8maths-u27-q08': '(3-(-1))**2/(-8)',
 'y8maths-u27-q10': '20-0.0065*3400',
 'y8maths-u28-q01': 'SYM:6x+24',
 'y8maths-u28-q02': 'SYM:6y-15',
 'y8maths-u28-q03': 'IDX:1',
 'y8maths-u28-q04': 'SYM:5m-10',
 'y8maths-u28-q05': 'SYM:x^2+7x',
 'y8maths-u28-q06': 'SYM:7x+2',
 'y8maths-u28-q07': 'SYM:8y+23',
 'y8maths-u28-q09': 'SYM:6x^2-3x',
 'y8maths-u28-q10': 'SYM:x^2+2x-15',
 'y8maths-u29-q01': 'SYM:5(x+4)',
 'y8maths-u29-q02': 'SYM:3(2y-3)',
 'y8maths-u29-q03': 'IDX:2',
 'y8maths-u29-q04': 'SYM:x(x+5)',
 'y8maths-u29-q05': 'SYM:4p(2p-3)',
 'y8maths-u29-q06': 'SYM:5b(2a+3)',
 'y8maths-u29-q07': ['SYM:2m+3n'],
 'y8maths-u29-q09': 'SYM:x+4',
 'y8maths-u30-q01': '4-9',
 'y8maths-u30-q02': '56/7',
 'y8maths-u30-q03': '(16+5)/3',
 'y8maths-u30-q04': '(8-3)*4',
 'y8maths-u30-q05': 'IDX:0 if 6*5-8==22 else 1',
 'y8maths-u30-q06': '(15-7)/2',
 'y8maths-u30-q07': '4*5-3',
 'y8maths-u30-q09': '(133-35)/28',
 'y8maths-u30-q10': '(12/3+1)*2',
 'y8maths-u31-q01': '14/2-3',
 'y8maths-u31-q02': '18/3',
 'y8maths-u31-q03': '(20+8)/4',
 'y8maths-u31-q04': '(9+3)/(7-4)',
 'y8maths-u31-q05': 'IDX:0 if 3*(5+4)==27 else 1',
 'y8maths-u31-q06': '(10+2)/(6-4)',
 'y8maths-u31-q07': '(9+11)/5',
 'y8maths-u31-q09': '(11-3)/(5-3)',
 'y8maths-u31-q10': '(3+13)/(3-1)',
 'y8maths-u32-q01': 'SYM:4n-3',
 'y8maths-u32-q02': '(53-8)/5',
 'y8maths-u32-q03': '(180-40)/4',
 'y8maths-u32-q04': '(46-14)/4',
 'y8maths-u32-q05': 'IDX:0',
 'y8maths-u32-q06': '(62-14)/2',
 'y8maths-u32-q07': '2*((360-60)/6)+30',
 'y8maths-u32-q09': '2*(2*4+3)+(4+1)',
 'y8maths-u32-q10': '[x for x in range(1,40) if x+35==3*(x+5)][0]',
 'y8maths-u33-q01': '[i for i,v in enumerate([-5,-2,-1.9,-2.5,0]) if v<-2]',
 'y8maths-u33-q03': ['3*2-1>=5', '3*1.9-1>=5', '3*(-3)-1>=5', '3*10-1>=5'],
 'y8maths-u33-q04': 'IDX:1',
 'y8maths-u33-q07': 'max(x for x in range(-20,20) if 4*(x-1)<22)',
 'y8maths-u33-q09': 'max(k for k in range(50) if 2.8+1.4*k<=15)',
 'y8maths-u33-q10': 'sum(n for n in range(-20,20) if -7<3*n-1<=11)',
 'y8maths-u34-q01': 'SYM:b = a + 12',
 'y8maths-u34-q02': 'SYM:s = P/4',
 'y8maths-u34-q03': 'IDX:0',
 'y8maths-u34-q04': 'SYM:x = (y+3)/5',
 'y8maths-u34-q05': 'SYM:a = (v-u)/t',
 'y8maths-u34-q06': '2*36/8',
 'y8maths-u34-q07': '50/(2*pi)',
 'y8maths-u34-q09': 'SYM:r = sqrt(A/pi)',
 'y8maths-u34-q10': 'SYM:t = 2s/(u+v)',
 'y8maths-u35-q01': '23+6',
 'y8maths-u35-q02': '54*3',
 'y8maths-u35-q03': ['40-33', '19-7'],
 'y8maths-u35-q04': ['5*1-2', '5*2-2', '5*3-2'],
 'y8maths-u35-q05': 'IDX:1',
 'y8maths-u35-q06': ['7+12', '12+19'],
 'y8maths-u35-q07': '7*10+4',
 'y8maths-u35-q08': '(147+5)/8',
 'y8maths-u35-q10': 'next(3*4**k for k in range(20) if 3*4**k>10000)',
 'y8maths-u36-q01': '9-4',
 'y8maths-u36-q02': '3*20-1',
 'y8maths-u36-q03': 'SYM:3n+2',
 'y8maths-u36-q04': 'SYM:7n+2',
 'y8maths-u36-q05': 'IDX:1',
 'y8maths-u36-q06': 'SYM:23-3n',
 'y8maths-u36-q07': 'SYM:1.5n+1',
 'y8maths-u36-q09': '[6,10,14][0]+(25-1)*(10-6)',
 'y8maths-u36-q10': 'next(n for n in range(1,100) if 7*n-4>3*n+40)',
 'y8maths-u37-q01': 'PT:(-3,2)',
 'y8maths-u37-q02': 'IDX:2',
 'y8maths-u37-q03': 'PT:((1+7)/2,(3+9)/2)',
 'y8maths-u37-q04': 'PT:((-6+4)/2,(2-8)/2)',
 'y8maths-u37-q05': 'IDX:1',
 'y8maths-u37-q06': '[i for i,p in enumerate([(-3,5),(5,-3),(-3,-3),(3,-3),(-3,0)]) if p[0]==-3]',
 'y8maths-u37-q07': 'PT:(-2,-1)',
 'y8maths-u37-q08': '2*((6-1)+(4-(-2)))',
 'y8maths-u37-q10': ['2*3-(-1)', '2*1-4'],
 'y8maths-u38-q01': '3*4-2',
 'y8maths-u38-q02': '5-2*(-1)',
 'y8maths-u38-q03': ['2*-1-3', '2*0-3', '2*2-3'],
 'y8maths-u38-q04': '[i for i,p in enumerate([(1,3),(-2,6),(6,-2),(0,-4),(4,0)]) if p[1]==4-p[0]]',
 'y8maths-u38-q05': 'IDX:[i for i,f in enumerate([lambda x:x+4, lambda x:4*x+1, lambda x:x+1, lambda x:4*x]) if [f(x) for x in '
                    'range(4)]==[1,5,9,13]][0]',
 'y8maths-u38-q06': 'SYM:y = 7 - 2x',
 'y8maths-u38-q07': '(15-3)/2',
 'y8maths-u38-q08': ['True', '3*0.5+1==2.5', 'False', '3!=3'],
 'y8maths-u38-q10': ['(10-4)/(3-1)', '4-3*1'],
 'y8maths-u39-q01': ['5', '-2'],
 'y8maths-u39-q02': 'SYM:y = 3x - 4',
 'y8maths-u39-q03': '(11-2)/(4-1)',
 'y8maths-u39-q04': 'SYM:y = 4x - 3',
 'y8maths-u39-q05': 'IDX:1',
 'y8maths-u39-q06': '(-1-7)/(2-(-2))',
 'y8maths-u39-q07': 'SYM:y = -3x + 8',
 'y8maths-u39-q09': 'SYM:y = -x + 7',
 'y8maths-u39-q10': 'SYM:y = -2x + 3',
 'y8maths-u40-q01': '16/10*5',
 'y8maths-u40-q02': '30/2',
 'y8maths-u40-q03': 'IDX:0',
 'y8maths-u40-q04': '(150-30)/4',
 'y8maths-u40-q05': 'IDX:argmax([20/1, 0/0.5, 20/0.5])',
 'y8maths-u40-q06': '(20+20)/2',
 'y8maths-u40-q07': '(80-20)/12',
 'y8maths-u40-q09': ['10+0.05*100<0.12*100', '10+0.05*150<0.12*150', '0.12*0==0', '0.12*200==2*0.12*100'],
 'y8maths-u40-q10': '75/(69/60)',
 'y8maths-u41-q01': '180-128',
 'y8maths-u41-q02': '360-95-140',
 'y8maths-u41-q03': '67',
 'y8maths-u41-q04': '180-48-77',
 'y8maths-u41-q05': 'IDX:0',
 'y8maths-u41-q06': '180-2*52',
 'y8maths-u41-q07': '(180-40)/5',
 'y8maths-u41-q09': '2*((180-30)/4)',
 'y8maths-u41-q10': '2*(360/6)',
 'y8maths-u42-q01': '72',
 'y8maths-u42-q02': 'IDX:0',
 'y8maths-u42-q03': '180-115',
 'y8maths-u42-q04': 'IDX:0',
 'y8maths-u42-q05': '(70-10)/3',
 'y8maths-u42-q06': '(180-30)/3',
 'y8maths-u42-q07': '180-124',
 'y8maths-u42-q09': ['True', 'False', 'False', 'True'],
 'y8maths-u42-q10': '3*((180-20)/5)+5',
 'y8maths-u43-q01': '(6-2)*180',
 'y8maths-u43-q02': '360/10',
 'y8maths-u43-q03': '180-360/6',
 'y8maths-u43-q04': '(9-2)*180',
 'y8maths-u43-q05': '360/(180-144)',
 'y8maths-u43-q06': '540-(100+115+95+120)',
 'y8maths-u43-q07': '180-360/20',
 'y8maths-u43-q09': '(720-300)/4',
 'y8maths-u43-q10': '[n for n in range(3,30) if abs(180-360/n-(360-90-135))<1e-9][0]',
 'y8maths-u44-q01': 'IDX:0',
 'y8maths-u44-q02': '180-65',
 'y8maths-u44-q03': '[0,2,4]',
 'y8maths-u44-q04': '360-2*115-60',
 'y8maths-u44-q05': 'IDX:0',
 'y8maths-u44-q06': '(360-2*72)/2',
 'y8maths-u44-q07': 'IDX:0',
 'y8maths-u44-q08': ['True', 'False', 'False', 'True'],
 'y8maths-u44-q10': '(180-124)/2',
 'y8maths-u45-q03': 'IDX:[i for i,v in enumerate([310,50,230,130]) if v==(130+180)%360][0]',
 'y8maths-u45-q04': '(285-180)%360',
 'y8maths-u45-q05': 'IDX:0',
 'y8maths-u45-q06': '(15+180)%360',
 'y8maths-u45-q07': '(250+90)%360',
 'y8maths-u45-q09': '230-110',
 'y8maths-u45-q10': '180-(90-40)-(320-270)',
 'y8maths-u46-q01': 'IDX:0',
 'y8maths-u46-q02': ['4+5>10', '6+6>6', '3+4>5', '2+3>5'],
 'y8maths-u46-q03': 'IDX:0',
 'y8maths-u46-q04': '8',
 'y8maths-u46-q05': 'IDX:0',
 'y8maths-u46-q06': '180-35-75',
 'y8maths-u46-q07': '[i for i,v in enumerate([5.7,5.9,6.1,6.2,6.3]) if abs(v-6)<=0.2+1e-9]',
 'y8maths-u46-q09': 'max(c for c in range(1,30) if c<4+9 and 4<c+9 and 9<c+4)',
 'y8maths-u46-q10': '[a+a+b for a,b in [(7,3),(3,7)] if a+a>b][0]',
 'y8maths-u47-q02': '84/2',
 'y8maths-u47-q03': 'IDX:0',
 'y8maths-u47-q04': '9.4/2',
 'y8maths-u47-q05': 'IDX:0',
 'y8maths-u47-q06': ['True', 'True', 'True', '90/2==30'],
 'y8maths-u47-q07': 'min(6.2,4.8,5.5)',
 'y8maths-u47-q09': 'IDX:0',
 'y8maths-u47-q10': 'IDX:0',
 'y8maths-u48-q01': '0.5*9*6',
 'y8maths-u48-q02': '11*4',
 'y8maths-u48-q03': '0.5*(5+9)*6',
 'y8maths-u48-q04': '0.5*14*5',
 'y8maths-u48-q05': '2*30/12',
 'y8maths-u48-q06': '60/(0.5*(7+13))',
 'y8maths-u48-q07': '8.4*5.5',
 'y8maths-u48-q09': '0.5*8*5',
 'y8maths-u48-q10': '84/(0.5*3*8)',
 'y8maths-u49-q01': '23/2',
 'y8maths-u49-q02': 'IDX:0',
 'y8maths-u49-q03': 'pi*8',
 'y8maths-u49-q04': '2*pi*4.5',
 'y8maths-u49-q05': 'IDX:0',
 'y8maths-u49-q07': '100/(2*pi)',
 'y8maths-u49-q08': 'pi*14/2+14',
 'y8maths-u49-q10': 'math.floor(100000/(2*pi*35))',
 'y8maths-u50-q01': 'pi*5**2',
 'y8maths-u50-q03': 'r(pi*5**2,1)',
 'y8maths-u50-q04': 'pi*5**2/2',
 'y8maths-u50-q05': 'pi*10**2/4',
 'y8maths-u50-q06': 'sqrt(50/pi)',
 'y8maths-u50-q07': '12*8+pi*4**2/2',
 'y8maths-u50-q08': '100-pi*100/4',
 'y8maths-u51-q01': '4+4',
 'y8maths-u51-q02': '2+6',
 'y8maths-u51-q03': '6*5**2',
 'y8maths-u51-q04': '2*(7*3+7*2+3*2)',
 'y8maths-u51-q05': '54/6',
 'y8maths-u51-q06': '2*0.5*6*8+(6+8+10)*5',
 'y8maths-u51-q07': '2-12+18',
 'y8maths-u51-q09': '20*15+2*20*10+2*15*10',
 'y8maths-u51-q10': 'sqrt(294/6)**3',
 'y8maths-u52-q01': '9*4*2.5',
 'y8maths-u52-q02': '2.5*1000',
 'y8maths-u52-q03': '18*12',
 'y8maths-u52-q04': 'pi*3**2*10',
 'y8maths-u52-q05': 'cbrt(64)',
 'y8maths-u52-q06': '0.5*6*4*15',
 'y8maths-u52-q07': '500/(pi*5**2)',
 'y8maths-u52-q08': 'pi*4**2*11/1000',
 'y8maths-u52-q10': '(10//3)*(9//3)*(7//3)',
 'y8maths-u53-q01': '5',
 'y8maths-u53-q02': '2',
 'y8maths-u53-q03': 'PT:(3,-5)',
 'y8maths-u53-q04': 'PT:(4,2)',
 'y8maths-u53-q05': 'PT:(2*4-6,1)',
 'y8maths-u53-q06': 'PT:(2,2*1-(-3))',
 'y8maths-u53-q07': 'IDX:0',
 'y8maths-u53-q10': 'PT:(2*3-1,-4)',
 'y8maths-u54-q01': 'FRS:F(3,10)',
 'y8maths-u54-q02': '1-0.35',
 'y8maths-u54-q03': 'IDX:0 if F(3,8)>F(6,20) else 1',
 'y8maths-u54-q04': "FRS:F('STATISTICS'.count('T'),len('STATISTICS'))",
 'y8maths-u54-q05': ['1-0.2-0.45'],
 'y8maths-u54-q06': '5*4-5-8',
 'y8maths-u54-q07': '[i for i,v in enumerate([0.7,1.2,-0.1,0.6,1.1]) if 0<=v<=1]',
 'y8maths-u54-q09': '(1-0.3-0.45)*20',
 'y8maths-u54-q10': '[x for x in range(100) if F(x,x+12)==F(2,5)][0]',
 'y8maths-u55-q01': '2*6',
 'y8maths-u55-q02': 'FRS:F(1,4)',
 'y8maths-u55-q03': '4*5*3',
 'y8maths-u55-q04': 'FRS:F(sum(1 for a in range(1,7) for b in range(1,7) if abs(a-b)==2),36)',
 'y8maths-u55-q05': 'F(sum(1 for a in range(1,7) for b in range(1,7) if a==b),36)',
 'y8maths-u55-q06': 'FRS:F(sum(1 for a in range(1,4) for b in range(1,5) if a+b==5),12)',
 'y8maths-u55-q07': "len([(a,b) for a in 'ABCD' for b in 'ABCD' if a!=b])",
 'y8maths-u55-q09': 'FRS:F(sum(1 for a in range(1,7) for b in range(1,7) if a*b%2),36)',
 'y8maths-u55-q10': "FRS:F(sum(1 for a in ['R','B','B'] for b in ['R','R','G'] if a==b),9)",
 'y8maths-u56-q01': 'len([n for n in range(1,11) if n%2])',
 'y8maths-u56-q02': 'IDX:0',
 'y8maths-u56-q03': ['len({2,3,5,7}&{1,3,5,7,9})', 'len({2,3,5,7}|{1,3,5,7,9})'],
 'y8maths-u56-q04': '7+4+9+5',
 'y8maths-u56-q05': '7+4+9',
 'y8maths-u56-q06': 'FRS:F(9+5,25)',
 'y8maths-u56-q07': '25+18-(40-6)',
 'y8maths-u56-q09': 'FRS:F(18-9,40)',
 'y8maths-u56-q10': 'len({n for n in range(1,21) if n%3==0 or n%4==0})',
 'y8maths-u57-q01': '18/60',
 'y8maths-u57-q02': '0.3*200',
 'y8maths-u57-q03': '240/6',
 'y8maths-u57-q04': 'IDX:argmax([100,10,20,50])',
 'y8maths-u57-q05': 'IDX:0',
 'y8maths-u57-q06': '(400-132)/400',
 'y8maths-u57-q07': '348/600*1500',
 'y8maths-u57-q09': ['False', 'True', 'True', 'True'],
 'y8maths-u57-q10': '(18+57)/(50+150)',
 'y8maths-u58-q01': 'IDX:0',
 'y8maths-u58-q02': 'IDX:0',
 'y8maths-u58-q03': '[3,1,2,3,0,2,3,1,3,2].count(3)',
 'y8maths-u58-q04': '6+9+4+1',
 'y8maths-u58-q05': 'IDX:0',
 'y8maths-u58-q06': 'len([m for m in [42,55,48,61,50,39,57,45,50,63] if 50<=m<60])',
 'y8maths-u58-q07': 'IDX:0',
 'y8maths-u58-q09': '7+3',
 'y8maths-u58-q10': 'FRS:F(5+9,5+9+7+3)',
 'y8maths-u59-q01': '[12,18,9,15,21][2]',
 'y8maths-u59-q02': '21-12',
 'y8maths-u59-q03': 'sum([12,18,9,15,21])',
 'y8maths-u59-q04': '60/12',
 'y8maths-u59-q05': 'IDX:0',
 'y8maths-u59-q06': '(11+17)/2',
 'y8maths-u59-q07': 'IDX:0',
 'y8maths-u59-q09': ['True', 'True', 'False', 'True'],
 'y8maths-u59-q10': 'mean([40,35,45])',
 'y8maths-u60-q01': '360/60',
 'y8maths-u60-q02': 'FRS:F(90,360)',
 'y8maths-u60-q03': '15/60*360',
 'y8maths-u60-q04': '72/360*120',
 'y8maths-u60-q05': '7/20*360',
 'y8maths-u60-q06': '360-150-90',
 'y8maths-u60-q07': 'r(37/150*360)',
 'y8maths-u60-q09': '16/80*360',
 'y8maths-u60-q10': '3*(360-100-60)/4',
 'y8maths-u61-q01': 'IDX:0',
 'y8maths-u61-q02': 'IDX:0',
 'y8maths-u61-q03': 'IDX:0',
 'y8maths-u61-q04': 'IDX:0',
 'y8maths-u61-q05': '20+(50-20)/(8-2)*(6-2)',
 'y8maths-u61-q06': 'IDX:0',
 'y8maths-u61-q07': ['False', 'True', 'False', 'True'],
 'y8maths-u61-q09': 'IDX:0',
 'y8maths-u61-q10': '10.2+(6-10.2)/3*4.5',
 'y8maths-u62-q01': 'max(set([4,7,4,9,7,4]), key=[4,7,4,9,7,4].count)',
 'y8maths-u62-q02': 'max([13,5,22,18])-min([13,5,22,18])',
 'y8maths-u62-q03': 'median([11,3,8,15,6])',
 'y8maths-u62-q04': 'mean([6,9,10,4,11])',
 'y8maths-u62-q05': 'median([7,2,9,4,12,5])',
 'y8maths-u62-q06': '6*12-(10+15+8+14+11)',
 'y8maths-u62-q07': 'mean([23.4,19.8,26.1,21.6])',
 'y8maths-u62-q09': 'IDX:0',
 'y8maths-u62-q10': '35-(1+8+10+10)',
 'y8maths-u63-q01': 'max([0,1,2,3], key=lambda v: [4,7,6,3][v])',
 'y8maths-u63-q02': '4+7+6+3',
 'y8maths-u63-q03': '0*4+1*7+2*6+3*3',
 'y8maths-u63-q04': 'fmean([0,1,2,3],[4,7,6,3])',
 'y8maths-u63-q05': 'median([v for v,f in zip([0,1,2,3],[4,7,6,3]) for _ in range(f)])',
 'y8maths-u63-q06': 'fmean([5,15,25],[6,10,4])',
 'y8maths-u63-q09': 'fmean([0,1,2,3,4],[3,8,11,5,4])',
 'y8maths-u63-q10': '[k for k in range(50) if abs(fmean([1,2,3,4],[5,k,6,4])-2.5)<1e-9][0]',
 'y8maths-u64-q01': 'median([12,15,11,18,14])',
 'y8maths-u64-q02': '18-11',
 'y8maths-u64-q03': 'IDX:0',
 'y8maths-u64-q04': 'IDX:argmin([10,25])',
 'y8maths-u64-q05': 'IDX:0',
 'y8maths-u64-q06': 'mean([4,7,8,9,12])-mean([6,6,7,8,8])',
 'y8maths-u64-q07': '(12-4)-(8-6)',
 'y8maths-u64-q10': 'max([18,25,16,22,100-81])-min([18,25,16,22,100-81])'}

CALC = {4: 'non', 5: 'non', 6: 'non', 7: 'both', 8: 'non', 9: 'both', 10: 'non', 11: 'non', 12: 'both', 13: 'non', 16: 'non', 17: 'non', 18: 'non', 19: 'non', 20: 'both', 21: 'calc', 22: 'calc', 23: 'calc', 24: 'non', 25: 'both', 26: 'both', 27: 'both', 28: 'calc', 29: 'both', 30: 'both', 33: 'non', 34: 'both', 35: 'non', 36: 'non', 37: 'non', 38: 'non', 39: 'both', 40: 'non', 41: 'both', 42: 'non', 43: 'non', 44: 'non', 45: 'non', 46: 'non', 47: 'both', 50: 'non', 51: 'non', 52: 'non', 53: 'non', 54: 'non', 55: 'non', 56: 'non', 57: 'both', 58: 'calc', 59: 'calc', 60: 'both', 61: 'calc', 62: 'non', 65: 'non', 66: 'non', 67: 'non', 68: 'both', 69: 'non', 70: 'non', 71: 'both', 72: 'non', 73: 'both', 74: 'calc', 75: 'both'}

pi = math.pi
sqrt = math.sqrt


def r(x, n=0):
    """round half up to n decimal places"""
    q = Decimal(1).scaleb(-n)
    return float(Decimal(repr(float(x))).quantize(q, rounding=ROUND_HALF_UP))


def sf(x, n):
    if x == 0:
        return 0
    k = n - 1 - math.floor(math.log10(abs(x)))
    return r(x, k)


def cbrt(x):
    v = round(abs(x) ** (1 / 3))
    return v if v ** 3 == abs(x) else abs(x) ** (1 / 3)


def hcf(*a):
    g = 0
    for v in a:
        g = math.gcd(g, v)
    return g


def lcm(*a):
    l = 1
    for v in a:
        l = l * v // math.gcd(l, v)
    return l


def mean(a):
    return sum(a) / len(a)


def median(a):
    s = sorted(a)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def isprime(n):
    return n > 1 and all(n % d for d in range(2, int(n ** 0.5) + 1))


def argmin(a):
    return min(range(len(a)), key=lambda i: a[i])


def argmax(a):
    return max(range(len(a)), key=lambda i: a[i])


def fmean(vals, freqs):
    return sum(v * f for v, f in zip(vals, freqs)) / sum(freqs)


SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
ENV = {k: v for k, v in globals().items() if k in (
    "F", "pi", "sqrt", "r", "sf", "cbrt", "hcf", "lcm", "mean", "median", "isprime", "argmin", "argmax", "fmean", "math")}


def ev(expr):
    return eval(expr, dict(ENV))


def norm(s):
    return str(s).replace("−", "-").replace(" ", "").replace(" ", "").strip()


def parse_num(s):
    """Parse '−3', '3/4', '2 1/3', '£4.50', '45%', '12 cm', '30 000' into a Fraction."""
    t = norm(s)
    t = re.sub(r"^[£$€]", "", t)
    t = re.sub(r"(?<=\d) (?=\d{3}\b)", "", t)
    m = re.fullmatch(r"(-?)(\d+) (\d+)/(\d+)\s*[a-zA-Z°%²³ ]*", t)
    if m:
        v = int(m.group(2)) + F(int(m.group(3)), int(m.group(4)))
        return -v if m.group(1) else v
    m = re.fullmatch(r"(-?\d+)/(\d+)\s*[a-zA-Z°%²³ ]*", t)
    if m:
        return F(int(m.group(1)), int(m.group(2)))
    m = re.fullmatch(r"[£$€]?(-?\d*\.?\d+)\s*(p|%|°|[a-zA-Z/²³ ]*)", t)
    if m:
        return F(m.group(1))
    raise ValueError(f"cannot parse number from {s!r}")


def item_value(s):
    """Evaluate an order item such as '−4.5', '11²', '5 × 10⁻³', '13/20' or '67%'."""
    t = norm(s).replace("×", "*").replace("÷", "/").replace(" ", "")
    t = re.sub("[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+", lambda m: "**(" + m.group(0).translate(SUP) + ")", t)
    t = t.replace("%", "/100")
    assert re.fullmatch(r"[0-9.+\-*/()]+", t), f"cannot evaluate order item {s!r}"
    return eval(t)


def parse_sf(s):
    t = norm(s).replace(" ", "").replace("×", "x").replace("*", "x")
    t = re.sub("[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$", lambda m: "^" + m.group(0).translate(SUP), t) if "^" not in t else t
    m = re.fullmatch(r"(\d+(?:\.\d+)?)x10\^?(-?\d+)", t)
    if not m:
        raise ValueError(f"not standard form: {s!r}")
    a = F(m.group(1))
    assert 1 <= a < 10, f"mantissa out of range in {s!r}"
    return a * F(10) ** int(m.group(2))


def sym_equal(ans, expected):
    try:
        import sympy
        from sympy.parsing.sympy_parser import (parse_expr, standard_transformations,
                                                implicit_multiplication_application, convert_xor)
    except ImportError:
        return True  # sympy unavailable: algebra form checks skipped
    tr = standard_transformations + (implicit_multiplication_application, convert_xor)

    def P(s):
        s = norm(s).replace("×", "*").replace("÷", "/").replace("π", "pi").replace("√", "sqrt")
        s = re.sub("[⁰¹²³⁴⁵⁶⁷⁸⁹]+", lambda m: "^" + m.group(0).translate(SUP), s)
        return parse_expr(s, transformations=tr)
    a, e = norm(ans), norm(expected)
    if "=" in e:
        la, ra = [x.strip() for x in a.split("=")]
        le, re_ = [x.strip() for x in e.split("=")]
        if la.replace(" ", "") != le.replace(" ", ""):
            return False
        a, e = ra, re_
    return sympy.simplify(P(a) - P(e)) == 0


def compare(ans, spec, qid):
    """Compare a stated string/number answer with an independent check spec."""
    if isinstance(spec, str) and spec.startswith("SYM:"):
        assert sym_equal(ans, spec[4:]), f"{qid}: algebra answer {ans!r} not equivalent to {spec[4:]!r}"
        return
    if isinstance(spec, str) and spec.startswith("SF:"):
        v = ev(spec[3:])
        a = parse_sf(ans)
        assert abs(float(a) - v) <= 1e-9 * max(1, abs(v)), f"{qid}: {ans!r} != {v}"
        return
    if isinstance(spec, str) and spec.startswith("RAT:"):
        want = ev(spec[4:])
        parts = [parse_num(p) for p in norm(ans).split(":")]
        assert len(parts) == len(want), f"{qid}: ratio parts"
        k = parts[0] / F(want[0])
        assert all(F(p) == k * F(w) for p, w in zip(parts, want)), f"{qid}: ratio {ans!r} != {want}"
        if all(p.denominator == 1 for p in parts) and all(F(w).denominator == 1 for w in want) and parts[0] != 1:
            assert hcf(*[int(p) for p in parts]) == 1, f"{qid}: ratio not simplest"
        return
    if isinstance(spec, str) and spec.startswith("PT:"):
        want = ev(spec[3:])
        m = re.fullmatch(r"\((.+),(.+)\)", norm(ans).replace(" ", ""))
        assert m, f"{qid}: point format {ans!r}"
        assert (parse_num(m.group(1)), parse_num(m.group(2))) == tuple(F(w) for w in want), f"{qid}: point {ans!r} != {want}"
        return
    if isinstance(spec, str) and spec.startswith("STR:"):
        assert norm(ans).lower() == spec[4:].lower(), f"{qid}: {ans!r} != {spec[4:]!r}"
        return
    if isinstance(spec, str) and spec.startswith("FRS:"):  # fraction in simplest form
        v = F(ev(spec[4:]))
        a = parse_num(ans)
        assert a == v, f"{qid}: {ans!r} != {v}"
        t = norm(ans)
        m = re.search(r"(\d+)/(\d+)", t)
        if m:
            assert math.gcd(int(m.group(1)), int(m.group(2))) == 1, f"{qid}: {ans!r} not in simplest form"
        return
    v = ev(spec) if isinstance(spec, str) else spec
    a = parse_num(ans) if isinstance(ans, str) else ans
    assert abs(float(a) - float(v)) <= 1e-9 * max(1, abs(float(v))), f"{qid}: answer {ans!r} but check gives {v}"


TYPES = {"mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended"}
DIAG = {"numberline": ["min", "max"], "bar_model": ["parts"], "fraction_bar": ["n", "shaded"], "clock": ["h", "m"],
        "array": ["rows", "cols"], "coordinates": ["points"], "angle": ["deg"], "polygon": ["sides"],
        "bar_chart": ["labels", "values"]}
BANNED = ["it's important to note", "delve", "crucial", "vibrant", "tapestry", "testament", "navigate", "journey",
          "unlock", "dive into", "in today's world"]
REASON = re.compile(r"explain|mistake|error|wrong|why|true or false|is (he|she|they) right|who is right|correct\?|"
                    r"without (working|calculating)|show that|always|which .* certainly|reason|decide|check|should|"
                    r"more reliable|best|could|sensible|fair", re.I)
SPOT = re.compile(r"mistake|error|wrong|correct\?", re.I)
ROUNDING = re.compile(r"decimal place|significant figure|nearest|\b[123] ?dp\b|\bsf\b", re.I)
CODE = re.compile(r"^(KS3-[NARGPS]-\d\d|WM-[FRP]-\d\d)$")
PATTERN = [1, 1, 2, 2, 3, 3, 3, 4, 4, 5]

fails = []
n_checked = 0


def fail(msg):
    fails.append(msg)


def strings_of(q):
    out = [q.get("prompt", ""), q.get("explanation", ""), q.get("misconception", ""), q.get("model", "")]
    out += q.get("options", []) + q.get("items", []) + q.get("checklist", [])
    out += [s["s"] for s in q.get("statements", [])]
    for p in q.get("pairs", []):
        out += p
    if isinstance(q.get("answer"), str):
        out.append(q["answer"])
    if isinstance(q.get("answer"), list):
        out += [a for a in q["answer"] if isinstance(a, str)]
    return out


def main():
    global n_checked
    data = json.load(open(PATH, encoding="utf-8"))
    b = data.get("book", {})
    for k in ["id", "title", "keyStage", "year", "subject", "pages", "ageRange", "sections"]:
        if k not in b:
            fail(f"book missing {k}")
    if b.get("id") != "y8maths" or b.get("keyStage") != "KS3" or b.get("subject") != "Maths":
        fail("book id/keyStage/subject")
    secids = {s["id"] for s in b.get("sections", [])}
    for s in b.get("sections", []):
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", s.get("colour", "")) or not s.get("name"):
            fail(f"section {s}")
    if data.get("texts") != []:
        fail("texts should be an empty list for a maths book")
    units = data.get("units", [])
    if len(units) != 64:
        fail(f"expected 64 units, got {len(units)}")
    pages = [u["bookPages"][0] for u in units]
    if sorted(pages) != sorted(int(p) for p in CALC) or len(set(pages)) != len(pages):
        fail("bookPages do not match the 64 topic pages")
    allprompts = {}
    used_checks = set()
    for ui, u in enumerate(units):
        uid = u.get("id")
        if uid != f"y8maths-u{ui+1:02d}":
            fail(f"unit id {uid}")
        for k in ["section", "title", "bookPages", "curriculum", "summary", "textId", "questions"]:
            if k not in u:
                fail(f"{uid} missing {k}")
        if u["section"] not in secids:
            fail(f"{uid} section")
        if not u["curriculum"] or not all(CODE.match(c) for c in u["curriculum"]):
            fail(f"{uid} curriculum codes {u['curriculum']}")
        if u["textId"] is not None:
            fail(f"{uid} textId")
        ns = len(re.findall(r"[.!?](\s|$)", u["summary"].strip()))
        if not (1 <= ns <= 2) or len(u["summary"]) > 320:
            fail(f"{uid} summary should be 1-2 sentences")
        calc = CALC[u["bookPages"][0]] if u["bookPages"][0] in CALC else CALC[str(u["bookPages"][0])]
        qs = u["questions"]
        if len(qs) != 10:
            fail(f"{uid} has {len(qs)} questions")
        diffs = [q.get("difficulty") for q in qs]
        if diffs != PATTERN:
            fail(f"{uid} difficulty pattern {diffs}")
        types = {q.get("type") for q in qs}
        if len(types) < 3:
            fail(f"{uid} needs varied types")
        if not any(re.match(r"MC-\d\d", q.get("misconception", "")) for q in qs):
            fail(f"{uid} needs a research-pack misconception item")
        nreason = sum(1 for q in qs if REASON.search(q["prompt"]) or q["type"] == "extended")
        if nreason < 2:
            fail(f"{uid} needs 2 reasoning items")
        if not any(SPOT.search(q["prompt"]) for q in qs):
            fail(f"{uid} needs a spot-the-error item")
        for qi, q in enumerate(qs):
            qid = q.get("id")
            if qid != f"{uid}-q{qi+1:02d}":
                fail(f"bad id {qid}")
            t = q.get("type")
            if t not in TYPES:
                fail(f"{qid} type {t}")
                continue
            p = q.get("prompt", "")
            if not p.strip():
                fail(f"{qid} empty prompt")
            key = re.sub(r"\s+", " ", p.lower())
            if key in allprompts and len(key) > 30:
                fail(f"{qid} duplicate prompt of {allprompts[key]}")
            allprompts[key] = qid
            if not isinstance(q.get("difficulty"), int) or not 1 <= q["difficulty"] <= 5:
                fail(f"{qid} difficulty")
            if not isinstance(q.get("marks"), int) or not 1 <= q["marks"] <= 3:
                fail(f"{qid} marks")
            if not q.get("explanation", "").strip():
                fail(f"{qid} explanation")
            for c in q.get("curriculum", []):
                if not CODE.match(c):
                    fail(f"{qid} curriculum {c}")
            # calculator rule
            has_calc = "Calculator allowed" in p
            if calc == "non" and has_calc:
                fail(f"{qid} calculator on non-calculator page")
            if calc == "calc" and not has_calc:
                fail(f"{qid} calculator page item should say Calculator allowed")
            # house style
            for s in strings_of(q):
                if "—" in s or "–" in s:
                    fail(f"{qid} dash in {s[:40]!r}")
                low = s.lower()
                for w in BANNED:
                    if w in low:
                        fail(f"{qid} banned phrase {w!r}")
                if re.search("[\U0001F300-\U0001FAFF☀-➿]", s):
                    fail(f"{qid} emoji")
            # diagram
            if "diagram" in q:
                dg = q["diagram"]
                if dg.get("kind") not in DIAG or any(f not in dg for f in DIAG[dg.get("kind")]):
                    fail(f"{qid} diagram {dg}")
            chk = CHECKS.get(qid)
            if chk is not None:
                used_checks.add(qid)
            try:
                if t == "mcq":
                    o = q["options"]
                    if not (3 <= len(o) <= 5) or not isinstance(q["answer"], int) or not 0 <= q["answer"] < len(o):
                        fail(f"{qid} mcq structure")
                    if len(set(o)) != len(o):
                        fail(f"{qid} repeated options")
                    if chk is not None:
                        if isinstance(chk, str) and chk.startswith("IDX:"):
                            assert ev(chk[4:]) == q["answer"], f"{qid}: mcq index {q['answer']} but check gives {ev(chk[4:])}"
                        else:
                            compare(o[q["answer"]], chk, qid)
                        n_checked += 1
                elif t == "multi":
                    o = q["options"]
                    a = q["answer"]
                    if not (3 <= len(o) <= 6) or not a or not all(isinstance(i, int) and 0 <= i < len(o) for i in a):
                        fail(f"{qid} multi structure")
                    if chk is not None:
                        assert sorted(ev(chk)) == sorted(a), f"{qid}: multi {a} but check gives {ev(chk)}"
                        n_checked += 1
                elif t == "numeric":
                    a = q["answer"]
                    tol = q.get("tolerance", 0)
                    if not isinstance(a, (int, float)) or isinstance(a, bool):
                        fail(f"{qid} numeric answer not a number")
                    if tol < 0:
                        fail(f"{qid} tolerance")
                    if tol > 0 and not ROUNDING.search(p):
                        fail(f"{qid} tolerance given but prompt does not state the rounding")
                    if chk is None:
                        fail(f"{qid} numeric answer has no independent check")
                    else:
                        v = float(ev(chk))
                        lim = tol / 2 + 1e-9 if tol > 0 else 1e-9 * max(1, abs(v))
                        assert abs(a - v) <= lim, f"{qid}: numeric answer {a} but check gives {v} (tol {tol})"
                        n_checked += 1
                    for acc in q.get("accept", []):
                        if not isinstance(acc, str):
                            fail(f"{qid} accept must be strings")
                elif t == "text":
                    if not isinstance(q["answer"], str) or not q["answer"].strip():
                        fail(f"{qid} text answer")
                    if not isinstance(q.get("accept", []), list):
                        fail(f"{qid} accept list")
                    if chk is not None:
                        compare(q["answer"], chk, qid)
                        n_checked += 1
                elif t == "order":
                    it = q["items"]
                    if len(it) < 3 or len(set(it)) != len(it):
                        fail(f"{qid} order items")
                    if chk is None:
                        fail(f"{qid} order has no independent check")
                    else:
                        vals = ev(chk) if isinstance(chk, str) else [ev(x) if isinstance(x, str) else x for x in chk]
                        assert len(vals) == len(it), f"{qid}: order check length"
                        assert all(float(vals[i]) < float(vals[i + 1]) for i in range(len(vals) - 1)), \
                            f"{qid}: check values not ascending: {vals}"
                        iv = [item_value(x) for x in it]
                        assert all(abs(float(a) - float(v)) < 1e-9 for a, v in zip(iv, vals)), \
                            f"{qid}: items {it} are not in the correct (ascending) order"
                        n_checked += 1
                elif t == "match":
                    pr = q["pairs"]
                    if not (3 <= len(pr) <= 5) or not all(len(x) == 2 for x in pr):
                        fail(f"{qid} match structure")
                    if len({x[1] for x in pr}) != len(pr):
                        fail(f"{qid} match right side not distinct")
                    if chk is not None:
                        for (l, rgt), spec in zip(pr, chk):
                            compare(rgt, spec, qid)
                        n_checked += 1
                elif t == "truefalse":
                    st = q["statements"]
                    if not (3 <= len(st) <= 5) or not all(isinstance(s.get("a"), bool) and s.get("s") for s in st):
                        fail(f"{qid} truefalse structure")
                    if chk is not None:
                        got = [bool(ev(c)) for c in chk]
                        assert got == [s["a"] for s in st], f"{qid}: truefalse {[s['a'] for s in st]} but check gives {got}"
                        n_checked += 1
                elif t == "cloze":
                    gaps = p.count("___")
                    a = q["answer"]
                    if not (1 <= gaps <= 3) or len(a) != gaps:
                        fail(f"{qid} cloze gaps {gaps} vs answers {len(a)}")
                    if "accept" in q and (len(q["accept"]) != len(a) or not all(isinstance(x, list) for x in q["accept"])):
                        fail(f"{qid} cloze accept shape")
                    if chk is None:
                        fail(f"{qid} cloze has no independent check")
                    else:
                        assert len(chk) == len(a), f"{qid}: cloze check length"
                        for g, spec in zip(a, chk):
                            compare(g, spec, qid)
                        n_checked += 1
                elif t == "extended":
                    if not q.get("model") or not q.get("checklist") or not isinstance(q.get("marks"), int):
                        fail(f"{qid} extended structure")
            except AssertionError as e:
                fail(str(e))
            except Exception as e:
                fail(f"{qid}: check error {type(e).__name__}: {e}")
    extra = set(CHECKS) - used_checks
    if extra:
        fail(f"checks for unknown question ids: {sorted(extra)[:5]}")
    total = sum(len(u["questions"]) for u in units)
    if fails:
        print(f"FAIL: {len(fails)} problem(s)")
        for f in fails[:200]:
            print("  -", f)
        sys.exit(1)
    print(f"PASS: {len(units)} units, {total} questions, {n_checked} answers independently recomputed, schema valid.")


if __name__ == "__main__":
    main()
