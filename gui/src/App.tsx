import React, { useState, useEffect } from 'react';
import './App.css';
import io from 'socket.io-client';
import {Container, AppBar, Toolbar, IconButton, Typography, Grid, Paper} from "@material-ui/core"
import { makeStyles } from '@material-ui/core/styles';
import MenuIcon from '@material-ui/icons/Menu';

const socket = io('http://localhost:3001');

const useStyles = makeStyles(theme => {
  return ({
    root: {
      flexGrow: 1,
    },
    menuButton: {
      marginRight: theme.spacing(2),
    },
    paper:{}
  });
});

const App: React.FC = () => {
  const defaultData: any = {};
const classes  = useStyles({});
const [status, setStatus] = useState("connecting");
const [json, setJson ] = useState(defaultData);
useEffect(() => {
socket.on('connected', ()=> {setStatus("Connected")});
socket.on('data', (data: any) => {setJson(data);console.log("Data", data)});
socket.on('disconnect', () => {});
socket.on('error', () => setStatus("Error"))
}, [])
  return (
    <Container>
      <AppBar position="static">
        <Toolbar variant="dense">
          <IconButton edge="start" className={classes.menuButton} color="inherit" aria-label="menu">
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" color="inherit">
            Photos
          </Typography>
        </Toolbar>
      </AppBar>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper className={classes.paper}>
            {status}

            Coins: {json.coins} 
          </Paper>

        </Grid>
      </Grid>
    </Container>
  );
}

export default App;
