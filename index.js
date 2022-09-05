import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import dayjs from 'dayjs';
import joi from 'joi';

const app = express();
app.use(cors());
app.use(express.json());

dotenv.config();

let db;
const mongoClient = new MongoClient(process.env.MONGO_URI);
mongoClient.connect().then(()=>{
    db = mongoClient.db('bate_papo_oul_api');
});

const participantSchema = joi.object({
    name: joi.string().min(1).required()
})

app.post('/participants', async (req,res) => {
    
    const {name} = req.body;
    const user = {name};
    const {error} = participantSchema.validate(user);

    if(error) {
        return res.status(422).send('Erro na validação do usuário!');
    }
    try {
        const RepeatedUser = await db.collection('participants').findOne({name: user})

        if(RepeatedUser) {
            return res.status(409).send('Este usuário já existe!');
        }

        await db.collection('participants').insertOne({name: user, lastStatus: Date.now()})
        await db.collection('messages').insertOne({
            from: user,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs.locale('pt-br').format('HH:MM:SS')
        })

        res.sendStatus(201);

    } catch (error) {
        res.status(500).send(error.message);
        
    }
})

app.get('/participants', async (req,res) => {
    try {
        const participants = await db.collection('participants').find().toArray();
        res.send(participants);
    } catch (error) {
        res.status(500).send(error.message);
        
    }
})

app.post('/messages', async (req,res) => {
    const {user} = req.headers;
    const message = req.body;
    const participant = await db.collection('participants').findOne({name: user});

    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid('message','private_message').required(),
        from: joi.string().valid(participant.name).required()
    })

    const {error} = messageSchema.validate(message, {abortEarly: false})

    if(error) {
        return res.status(422).send(error.details.map(detail => detail.message))
    }

    try {
        await db.collection('messages').insertOne({
            from: user,
            to: message.to,
            text: message.text,
            type: message.type,
            time: dayjs().format('HH:MM:SS')
        })
        res.sendStatus(201);

    } catch (error) {
        console.log(error)
    }
})

app.get('/messages', async (req,res) => {

    const {user} = req.headers;
    const limit = parseInt(req.query.limit);

    function validateMessages(messages) {
        if(messages.type === 'message' || messages.from === user || messages.to === user || messages.to === 'Todos') {
            return true;
        
        } else {
            return false;
        }
    }

    try {
        const messages = await db.collection('messages').find().toArray();

        const filtermessages = messages.filter(messages => validateMessages(messages));

        if(!limit || limit === NaN) {
            res.send(filtermessages);
            return;
        }

        res.send(filtermessages.slice(-limit));

    } catch (error) {
        res.status(500).send(error.message);
        
    }

})

app.post('/status', async (req,res) => {
    const {user} = req.headers;

    try {
        const validateUser = await db.collection('participants').findOne({name: user});

        if(!validateUser) {
            res.sendStatus(404);
            return;
        }

        await db.collection('participants').updateOne({name : user},{$set:{lastStatus: Date.now()}});
        res.sendStatus(200);

    } catch (error) {
        res.status(500).send(error.message);
    }
})

setInterval( async () => {
    try {
        const timeNow = Date.now();
        const users = await db.collection('participants').find().toArray();

        for(let i = 0; i < users.length; i++) {
            const user = users[i]
            if(timeNow - user.lastStatus > 10000) {
                const exitMessage = {
                    from: user.name,
                    to: 'Todos',
                    text: 'sai da sala...',
                    type: 'status',
                    time: dayjs().format('HH:MM:SS')
                };

                await db.collection('participants').deleteOne({name: user.name});
                await db.collection('messages').insertOne(exitMessage);
            }
        }

    } catch (error) {
        console.log(error);
        res.sendStatus(500);
    }
})

app.listen(5000, ()=>
console.log('Listening on port 5000'));


