import AccessManager from './src/access_manager';
import PaidleaveManager from './src/paidleave_manager';

(new AccessManager()).start();
(new PaidleaveManager()).start();