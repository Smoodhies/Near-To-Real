class Apiresponse {
  constructor({ statusCode, message, success = true, data = null }) {
    this.status = statusCode;
    this.message = message;
    this.data = data;
    this.success = this.statusCode < 400;
  }
}

const ApiresponseObject = {
  SendResponse(config) {
    // console.log(config ,"this from api response ❗")
    return new Apiresponse(config);
  },
};

export default ApiresponseObject;
