jest.mock('../config/db',()=>({sql:{}}));
const {validatePermanentLock}=require('../services/permanentBookingLockService');
function fixture(){return {booking:{BookingID:312,Status:'Closed',NegotiatedPrice:3380000,PremiumAmount:0,MasterAgreedAmount:3380000,AmountPaidToDate:3380000},payments:[{PaymentID:494,Status:'Posted',VoucherNo:'JV-2200',VoucherID:13989}],headers:[{VoucherID:13120,VoucherNo:'JV-1904',Status:'Reversed'},{VoucherID:13145,VoucherNo:'JV-REV-1918',Status:'Posted',ReversesVoucherID:13120},{VoucherID:13989,VoucherNo:'JV-2200',Status:'Posted',ReversesVoucherID:null}],sharedLines:[],masterPaid:3380000,expectedVoucherNo:'JV-2200',user:{groupId:1,userId:1},reason:'Owner approved permanent booking protection'};}
test('locks the restored voucher and prior reversal history together',()=>expect(validatePermanentLock(fixture())).toEqual([13120,13145,13989]));
test.each([['ordinary administrator',{groupId:2,userId:2}],['missing user',{groupId:1}],['no user',null]])('rejects %s',(label,user)=>{const f=fixture();f.user=user;expect(()=>validatePermanentLock(f)).toThrow('main Administrator');});
test.each(['PendingPayment','GatePassIssued','Cancelled'])('rejects nonclosed %s',status=>{const f=fixture();f.booking.Status=status;expect(()=>validatePermanentLock(f)).toThrow('closed');});
test('refuses locking if restored payment is reversed again',()=>{const f=fixture();f.headers[2].Status='Reversed';expect(()=>validatePermanentLock(f)).toThrow('still be posted');});
test('a posted reversal cannot stand in for the original payment',()=>{const f=fixture();f.headers[2].ReversesVoucherID=42;expect(()=>validatePermanentLock(f)).toThrow('still be posted');});
test('refuses a payment detached from the voucher',()=>{const f=fixture();f.payments[0].VoucherID=null;expect(()=>validatePermanentLock(f)).toThrow('still be posted');});
test('protects other bookings from a shared voucher lock',()=>{const f=fixture();f.sharedLines=[{BookingID:315}];expect(()=>validatePermanentLock(f)).toThrow('another booking');});
test('requires all Master payment to remain in the books',()=>{const f=fixture();f.masterPaid=0;expect(()=>validatePermanentLock(f)).toThrow('Master payment');});
test('includes customer premium in settlement',()=>{const f=fixture();f.booking.PremiumAmount=500;expect(()=>validatePermanentLock(f)).toThrow('Customer payment');});
test('honors a higher variant Master amount without an agreement',()=>{const f=fixture();f.booking.MasterAgreedAmount=null;f.booking.WholesalePrice=3430700;expect(()=>validatePermanentLock(f)).toThrow('Master payment');});
test('refuses pending draft vouchers',()=>{const f=fixture();f.headers.push({VoucherID:42,Status:'Draft'});expect(()=>validatePermanentLock(f)).toThrow('draft');});
test('requires an audit reason',()=>{const f=fixture();f.reason='x';expect(()=>validatePermanentLock(f)).toThrow('reason');});
