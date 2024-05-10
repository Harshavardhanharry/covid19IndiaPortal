const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

app.use(express.json())

let db = null

const initializedbAndServer = async () => {
  try {
    db = await open({
      fileName: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => 
      console.log('Server is running at http://localhost:3000/')
    )
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializedbAndServer()

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
  SELECT 
    *
  FROM user
  WHERE username = ${username};`
  const databaseUser = await db.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid User')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
  SELECT
    *
  FROM 
     state;`;
  const statesArray = await db.all(getStatesQuery)
  response.send(
    statesArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState)
    )
  );
});

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
  SELECT
    *
  FROM
    state
  WHERE 
  state_id = ${stateId};`
  const state = await db.get(getStateQuery)
  response.send(convertStateDbObjectToResponseObject(state))
})

app.get(
  'districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
  SELECT
   *
  FROM
    district
  WHERE 
    district_id = ${districtId};`
    const district = await db.get(getDistrictQuery)
    response.send(convertDistrictDbObjectToResponseObject(district))
  },
)

app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
  INSERT INTO
  district (state_id,district_name,cases,cured,active,deaths)
  VALUES
   (${stateId}, '${districtName})', ${cases}, ${cured}, ${active}, ${deaths});`
  await db.run(postDistrictQuery)
  response.send('District Successfully Added')
});

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  (request, response) => {
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE 
    district_id = ${districtId};`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  }
);

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name: '${districtName}',
    state_id: ${stateId},
    cases: ${cases},
    cured: ${cured},
    active: ${active},
    deaths: ${deaths}
  WHERE 
    district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  }
);

app.get(
  'states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatsQuery = `
  SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
  FROM
    district
  WHERE 
    state_id = ${stateId};`
    const stats = db.get(getStateStatsQuery)
    response.send({
      totalCases: stats['SUM{cases}'],
      totalCured: stats['SUM{cured}'],
      totalActive: stats['SUM{active}'],
      totalDeaths: stats['SUM{deaths}'],
    })
  }
);
module.exports = app;
