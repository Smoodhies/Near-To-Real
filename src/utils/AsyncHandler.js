// const asyncHandler = (Function)=>{
//     return
//     (
//         (request , response , next)=>{
//             Promise.resolve(Function(request , response )
//             .catch((error)=>{
//                 next(error)
//             }
//             )
//         )
            
//         }
//     )
// }




// another for simple understanding async function
 
const AsyncFunctionHandler = (asynFunction) => {

 return (
    async (req , resp , next ) => {

    try {
        await asynFunction(req,resp,next)
    } catch (error) {
    
       resp.status(error.code || 500).json({
         success: false,
         message: error.message,
       });
    }
    
}  
)  

};

export default AsyncFunctionHandler; 



