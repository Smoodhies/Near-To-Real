class Apiresponse {
  constructor({ statusCode, message, success = true, data = null }) {
    this.status = statusCode;
    this.message = message;
    this.data = data;
    this.success = this.statusCode < 400;
  }
}

const ApiResponseObject = {
  SendResponse(config) {
    return new ApiResponse(config);
  },
};

export default ApiresponseObject;
