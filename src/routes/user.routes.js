import Router from 'express';
import Upload from '../middleware/multer.controller';

const router =  Router()

// have to work of multer upload file function is not written yet 
router.routes("/upload").Post(Upload())   
