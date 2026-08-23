const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // GeoJSON boundary uploads can be large

// Request log to stdout; req.user is set by route-level auth and available at
// response time (morgan logs on finish).
morgan.token('user', (req) => (req.user ? req.user.id : '-'));
app.use(
  morgan(':date[iso] :remote-addr user=:user :method :url :status :res[content-length] :response-time ms', {
    skip: (req) => req.path === '/api/health',
  })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/public', require('./routes/public.routes'));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));

const master = require('./routes/masterData.routes');
app.use('/api/organizations', master.organizations);
app.use('/api/sectors', master.sectors);
app.use('/api/activity-types', master.activityTypes);
app.use('/api/beneficiary-groups', master.beneficiaryGroups);
app.use('/api/events', master.events);
app.use('/api/disaggregations', master.disaggregations);
app.use('/api/inform-components', master.informComponents);

app.use('/api/locations', require('./routes/locations.routes'));
app.use('/api/admin-level-config', require('./routes/adminLevelConfig.routes'));
app.use('/api/projects', require('./routes/projects.routes'));
app.use('/api/activities', require('./routes/activities.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/export', require('./routes/export.routes'));
app.use('/api/import', require('./routes/import.routes'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
